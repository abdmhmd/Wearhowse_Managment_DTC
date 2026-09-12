import { runInTransaction, pool } from '../../config/database';
import { materialRequestsRepository, MaterialRequestDetail, RequestType } from './material-requests.repository';
import { transactionsService } from '../transactions/transactions.service';
import { transactionsRepository } from '../transactions/transactions.repository';
import { itemsRepository } from '../items/items.repository';
import { stockMovementsRepository } from '../stock-movements/stock-movements.repository';
import { warehousesRepository } from '../warehouses/warehouses.repository';
import { custodiesRepository } from '../custodies/custodies.repository';
import { projectsRepository } from '../projects/projects.repository';
import { NotFoundError, ValidationError, ConflictError, AppError } from '../../utils/AppError';
import { scopeForUser, isWarehouseFallbackUser, type DataScope } from '../authorization/scope';
import { PERMISSIONS } from '../authorization/permissions';
import { logger } from '../../utils/logger';
import type { AuthUserContext } from '../authorization/authorization.service';

/**
 * Material request workflow (enforced by the repository/service state machine):
 *
 *   pending  --(sub-WH or dept manager approves)-->  wm_approved / dept_approved
 *   dept_approved --(dept manager forwards)--> forwarded
 *   forwarded --(approve)--> admin_approved --(issue)--> issued
 *   forwarded --(reject)--> admin_rejected
 *   pending  --(sub-WH rejects, D13)--> wm_rejected
 *   pending / dept_approved / wm_approved / forwarded / admin_approved --(cancel)--> cancelled
 *
 * - department_manager approves and forwards ONLY requests of their own department
 *   (requests:approve / requests:forward).
 * - sub_warehouse_manager approves supervisor-originated requests straight into
 *   wm_approved and issues them (requests:approve / requests:issue). They may
 *   also reject a PENDING request before it is approved (requests:reject, D13).
 * - All authorization is permission-based (user.permissions) — no branch relies
 *   on `role === 'admin'` anymore. After Phase 2 the system administrator holds
 *   no requests:* permission, so every admin-only path is unreachable via HTTP.
 */
export class MaterialRequestsService {

  async createRequest(
    requestedBy: number,
    data: {
      department_id?: number | null;
      warehouse_id?: number | null;
      request_type?: RequestType;
      project_id?: number | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      needed_by?: string;
      notes?: string;
      items: Array<{ item_id: number; quantity: number; unit_code?: string; notes?: string }>;
    },
    user?: AuthUserContext
  ) {
    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Request must have at least one item', {});
    }

    const scope: DataScope | null = user ? scopeForUser(user) : null;
    if (user) {
      // A department_manager is the APPROVAL layer, never the creator: the
      // intended creator is the sub_warehouse_manager of the department warehouse,
      // a supervisor of the department, or the admin. Enforced
      // server-side so a hand-crafted payload (or a future permission
      // regrant) cannot bypass it.
      if (user.role === 'department_manager') {
        throw new ValidationError('Only warehouse managers, supervisors or system administrators can create material requests', {});
      }
      // Fail closed for every NONE-scope user EXCEPT a sub_warehouse_manager with
      // zero assignments (who resolves to NONE but is allowed through to the
      // zero-assignment fallback below) and a supervisor (handled in the
      // dedicated supervisor branch further down).
      const isSupervisor = user.role === 'supervisor';
      if (scope === 'NONE' && !isWarehouseFallbackUser(user) && !isSupervisor) {
        throw new ValidationError('You are not authorized to create material requests', {});
      }
    }

    // ── Resolve the destination warehouse from the AUTHENTICATED USER ───────
    let warehouseId: number;
    let departmentWarehouses: { id: number }[] = [];

    if (user?.role === 'supervisor') {
      // ── Supervisor: department DERIVED from the authenticated user ─────────
      // The supervisor's department is NEVER taken from the client payload. The
      // destination warehouse MUST belong to that department — a payload
      // `warehouse_id` of another department is rejected outright, so a
      // supervisor cannot leak a request into a foreign department. When the
      // department owns exactly one eligible (active, non-main) warehouse it is
      // auto-selected, mirroring the frontend's single-warehouse behavior.
      if (user.department_id == null) {
        throw new ValidationError('Your account is not assigned to a department. Contact your administrator.', {});
      }
      departmentWarehouses = await warehousesRepository.findByDepartmentEligible(user.department_id);
      if (data.warehouse_id == null) {
        if (departmentWarehouses.length === 1) {
          warehouseId = departmentWarehouses[0].id;
        } else if (departmentWarehouses.length === 0) {
          throw new ValidationError('Your department has no eligible warehouse to receive material requests. Contact your administrator.', {});
        } else {
          throw new ValidationError('Please select a warehouse belonging to your department.', {});
        }
      } else {
        if (!departmentWarehouses.some((w) => w.id === data.warehouse_id)) {
          throw new ValidationError('The selected warehouse does not belong to your department.', { warehouse_id: data.warehouse_id });
        }
        warehouseId = data.warehouse_id;
      }
    } else if (user && scope !== 'GLOBAL') {
      if (user.warehouse_ids.length > 0) {
        // ── Case A: the user HAS assigned warehouses ─────────────────────────
        // Validates explicit warehouse_id against the caller's assigned eligible warehouses.
        // If omitted, defaults to the first assigned warehouse for backward compatibility.
        const assigned = await warehousesRepository.findAssignedNonMainByUser(user.id);
        if (assigned.length === 0) {
          // Assignments exist but none is an eligible destination (e.g. only the
          // department MAIN warehouse or only inactive warehouses).
          throw new ValidationError('Your assigned warehouses are not eligible request destinations. Contact your administrator.', {});
        }
        if (data.warehouse_id != null) {
          const selected = assigned.find((w) => w.id === data.warehouse_id);
          if (!selected) {
            throw new ValidationError('The selected warehouse is not in your assigned eligible warehouses', { warehouse_id: data.warehouse_id });
          }
          warehouseId = selected.id;
        } else {
          warehouseId = assigned[0].id;
        }
      } else {
        // ── Case B: ZERO assigned warehouses (fallback) ──────────────────────
        // The payload `warehouse_id` is now MANDATORY and validated (exists,
        // active, non-main, linked to a department). This fallback NEVER
        // applies when the user has assignments — those stay strictly Case A.
        if (data.warehouse_id == null) {
          throw new ValidationError('You have no assigned warehouses. Please select a valid warehouse to proceed.', {});
        }
        const eligible = await warehousesRepository.findEligibleDestination(data.warehouse_id);
        if (!eligible) {
          throw new ValidationError('You have no assigned warehouses. Please select a valid warehouse to proceed.', {});
        }
        warehouseId = data.warehouse_id;
      }
    } else if (data.warehouse_id != null) {
      // admin (GLOBAL scope) or an internal caller without a user context
      // may pick an explicit warehouse; it is still validated below.
      warehouseId = data.warehouse_id;
    } else {
      const first = await warehousesRepository.findFirstActiveNonMain();
      if (!first) {
        throw new ValidationError('No warehouse available. Contact your administrator.', {});
      }
      warehouseId = first.id;
    }

    // ── Validate the resolved warehouse and derive the department ───────────
    const wh = await warehousesRepository.findById(warehouseId);
    if (!wh) {
      throw new ValidationError('The selected warehouse does not exist', { warehouse_id: warehouseId });
    }
    if (wh.department_id == null) {
      throw new ValidationError('The selected warehouse is not linked to a department', { warehouse_id: warehouseId });
    }
    if (wh.is_main) {
      // The routing trigger (migration 020) forbids targeting a department's
      // MAIN warehouse as the request destination; reject cleanly instead of a
      // raw 500 from the database constraint.
      throw new ValidationError('The selected warehouse is the department main warehouse and cannot be a request destination', { warehouse_id: warehouseId });
    }

    // Guard: the department MUST have a main warehouse (stock source) or the
    // request can never be issued.  Reject early at creation time instead of
    // failing silently when the warehouse manager tries to issue later.
    if (wh.department_id != null) {
      const mainWh = await warehousesRepository.findMainByDepartment(wh.department_id);
      if (!mainWh) {
        throw new ValidationError(
          'The department does not have a main warehouse configured. Contact your administrator to set up a main warehouse before creating requests.',
          { warehouse_id: warehouseId, department_id: wh.department_id },
          'NO_MAIN_WAREHOUSE'
        );
      }
    }

    // The request department is DERIVED from the destination warehouse
    // (warehouses.department_id). A client-supplied department_id that
    // contradicts the warehouse is a conflict and is rejected outright.
    if (data.department_id != null && data.department_id !== wh.department_id) {
      throw new ConflictError(
        'The warehouse belongs to a different department than the one submitted',
        'DEPARTMENT_WAREHOUSE_MISMATCH',
        { warehouse_id: warehouseId, department_id: data.department_id }
      );
    }
    const resolvedDepartmentId = wh.department_id;

    // A request may target a project only when the project exists, is open for
    // material requests, and belongs to the SAME department as the destination
    // warehouse. Enforced server-side so a hand-crafted payload cannot attach a
    // request to a project of another department.
    if (data.project_id != null) {
      const project = await projectsRepository.findById(data.project_id);
      if (!project) {
        throw new ValidationError('The selected project does not exist', { project_id: data.project_id });
      }
      if (project.status !== 'open') {
        throw new ValidationError(
          `The selected project is not open for material requests (status: ${project.status})`,
          { project_id: data.project_id, status: project.status }
        );
      }
      if (project.department_id !== resolvedDepartmentId) {
        throw new ConflictError(
          'The selected project belongs to a different department than the request warehouse',
          'PROJECT_DEPARTMENT_MISMATCH',
          { project_id: data.project_id, department_id: resolvedDepartmentId, project_department_id: project.department_id }
        );
      }
      // A supervisor may attach a request ONLY to a project they personally
      // supervise (their own department is already guaranteed above, since the
      // warehouse is restricted to the supervisor's department). Enforced
      // server-side so a hand-crafted payload cannot attach a request to a
      // colleague's project.
      if (user?.role === 'supervisor' && project.supervisor_id !== user.id) {
        throw new ValidationError(
          'You can only create material requests for a project you supervise',
          { project_id: data.project_id, project_supervisor_id: project.supervisor_id }
        );
      }
    }

    // ── Item/unit invariant (ALL roles) ─────────────────────────────────────
    // The unit is a SERVER-DERIVED property of the item: every line is
    // persisted with the item's authoritative base unit (items.unit_code),
    // regardless of what the client sent. A forged unit_code can never enter
    // material_request_details. The transaction engine's unit validation
    // remains as a final safety layer at issue time.
    for (const line of data.items) {
      const itemRow = await pool.query(
        `SELECT i.id, i.item_code, i.unit_code FROM items i WHERE i.id = $1 AND i.is_active = true`,
        [line.item_id]
      );
      const baseItem = itemRow.rows[0];
      if (!baseItem) {
        throw new ValidationError('The selected item does not exist or is inactive', { item_id: line.item_id });
      }
      if (!baseItem.unit_code) {
        throw new ValidationError(
          `Item '${baseItem.item_code}' has no base unit configured; contact your administrator`,
          { item_id: line.item_id }
        );
      }
      line.unit_code = baseItem.unit_code;
    }

    // ── Supervisor line-item hardening (server-side authority) ──────────────
    // Every item_id / unit_code submitted by a supervisor must resolve to an
    // ACTIVE item stored in one of the supervisor's department warehouses and
    // to an ACTIVE unit. The client may only ever submit values from the
    // /api/requests/catalog scope; this re-validation guarantees a hand-crafted
    // payload cannot reference a foreign or deactivated item/unit.
    if (user?.role === 'supervisor') {
      const deptWarehouseIds = departmentWarehouses.map((w) => w.id);
      for (const line of data.items) {
        const itemRow = await pool.query(
          `SELECT i.id, i.is_active, i.warehouse_id
             FROM items i
            WHERE i.id = $1`,
          [line.item_id]
        );
        const item = itemRow.rows[0];
        if (!item || !item.is_active) {
          throw new ValidationError('The selected item does not exist or is inactive', { item_id: line.item_id });
        }
        if (!deptWarehouseIds.includes(item.warehouse_id)) {
          throw new ValidationError(
            'The selected item does not belong to your department',
            { item_id: line.item_id, warehouse_id: item.warehouse_id }
          );
        }
        const unitRow = await pool.query(
          `SELECT 1 FROM units WHERE code = $1 AND is_active = true`,
          [line.unit_code]
        );
        if (unitRow.rows.length === 0) {
          throw new ValidationError('The selected unit is invalid or inactive', { unit_code: line.unit_code });
        }
      }
    }

    return runInTransaction(async (client) => {
      const request_no = await materialRequestsRepository.generateRequestNo();

      const header = await materialRequestsRepository.create(client, {
        request_no,
        department_id: resolvedDepartmentId,
        warehouse_id: warehouseId,
        requested_by: requestedBy,
        status: 'pending',
        priority: data.priority ?? 'normal',
        request_type: data.request_type ?? 'experiment',
        project_id: data.project_id ?? null,
        needed_by: data.needed_by ? new Date(data.needed_by) : null,
        notes: data.notes ?? null,
      });

      const details = [];
      for (const item of data.items) {
        const detail = await materialRequestsRepository.createDetail(client, {
          request_id: header.id,
          item_id: item.item_id,
          quantity: item.quantity,
          unit_code: item.unit_code!, // server-derived above — always set
          notes: item.notes ?? null,
        });
        details.push(detail);
      }

      return { ...header, details };
    });
  }

  /**
   * Request-creation catalog for request creators (requests:create).
   *
   * Every value this endpoint returns is pre-scoped to the caller's authority,
   * so the frontend never needs the generic catalog endpoints (warehouses /
   * items / units / departments) — which a `supervisor` correctly does NOT
   * have permission to read.
   *
   *  - department  : the caller's department (names resolved from the auth user)
   *  - warehouses  : eligible (active, non-main) warehouses of that department
   *  - items       : ACTIVE items stored in the department's eligible
   *                  warehouses, each carrying its authoritative BASE unit
   *                  (unit is derived from the item — never freely chosen)
   *
   * Callers without a department (e.g. a global admin) receive
   * department=null and empty warehouse/item lists.
   */
  async getRequestCatalog(user: AuthUserContext) {
    const departmentId = user.department_id;
    const department =
      departmentId == null
        ? null
        : {
            id: departmentId,
            name_ar: user.department_name_ar,
            name_en: user.department_name_en,
          };

    const [warehouses, items] = await Promise.all([
      departmentId == null ? Promise.resolve([]) : warehousesRepository.findByDepartmentEligible(departmentId),
      departmentId == null
        ? Promise.resolve([])
        : pool.query(
            `SELECT i.id, i.item_code, i.name_ar, i.name_en, i.unit_code,
                    i.unit_code AS base_unit_code,
                    u.name_ar   AS base_unit_name_ar,
                    u.name_en   AS base_unit_name_en,
                    i.category_code,
                    i.current_balance, i.is_consumable
               FROM items i
               JOIN warehouses w ON w.id = i.warehouse_id
               LEFT JOIN units u ON u.code = i.unit_code
              WHERE i.is_active = true
                AND w.is_active = true
                AND w.department_id = $1
                AND i.current_balance > 0
              ORDER BY i.item_code`,
            [departmentId]
          ).then((r) => r.rows),
    ]);

    return { department, warehouses, items };
  }

  async getById(id: number, user?: AuthUserContext) {
    const header = await materialRequestsRepository.findById(id);
    if (!header) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id });
    if (user && !this.inScope(header, user)) {
      // requests:view_own lets the requester always track their own request
      // even when the department/warehouse scope would not normally include it.
      const ownsRequest =
        user.permissions.includes(PERMISSIONS.REQUESTS_VIEW_OWN) &&
        header.requested_by === user.id;
      if (!ownsRequest) {
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id });
      }
    }
    const details = await materialRequestsRepository.findDetailsByRequestId(id);
    return { ...header, details };
  }

  private inScope(request: { department_id: number; warehouse_id: number }, user: AuthUserContext): boolean {
    const scope: DataScope = scopeForUser(user);
    if (scope === 'GLOBAL') return true;
    if (scope === 'DEPARTMENT') return request.department_id === user.department_id;
    if (scope === 'WAREHOUSE') return user.warehouse_ids.includes(request.warehouse_id);
    return false;
  }

  /**
   * Defensive service-layer permission guard. The route middleware already
   * enforces permissions; this repeats the check so the service stays safe
   * when invoked directly (tests, internal callers). A `user` that is
   * undefined (direct service call) is allowed through, matching the project
   * convention for legacy/utility invocations.
   */
  private assertPermission(user: AuthUserContext | undefined, permission: string) {
    if (user && !user.permissions.includes(permission)) {
      throw new AppError(`Missing required permission: ${permission}`, 403, 'AUTH_FORBIDDEN');
    }
  }

  async getAll(filters: {
    status?: string;
    department_id?: number;
    warehouse_id?: number;
    requested_by?: number;
    request_type?: RequestType;
    page?: number;
    limit?: number;
    user?: AuthUserContext;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const { items, total } = await materialRequestsRepository.findAll({
      status: filters.status as any,
      department_id: filters.department_id,
      warehouse_id: filters.warehouse_id,
      requested_by: filters.requested_by,
      request_type: filters.request_type,
      user: filters.user,
      includeOwnRequests: filters.user?.permissions.includes(PERMISSIONS.REQUESTS_VIEW_OWN) ?? false,
      limit,
      offset,
    });

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Department-level approval of a 'pending' request (department_manager) OR
   * warehouse-manager approval of a 'pending' request from a supervisor
   * (sub_warehouse_manager). The historical admin approval of a 'forwarded'
   * request still exists for legacy data, but after Phase 2 no role that can
   * approve holds it — the system administrator has no requests:* permission.
   */
  async approveRequest(requestId: number, approvedBy: number, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findByIdForUpdate(client, requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      if (user && !this.inScope(request, user)) {
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }
      this.assertPermission(user, PERMISSIONS.REQUESTS_APPROVE);

      // Mandatory authorization constraint: a department_manager may NEVER
      // approve a request they created themselves. Enforced here in the service
      // (not only in the UI) so a direct API call or a forged payload is
      // rejected too — regardless of the request's status, scope or the user's
      // requests:approve permission.
      if (user?.role === 'department_manager' && request.requested_by === user.id) {
        throw new AppError(
          'A department manager cannot approve a request they created themselves.',
          403,
          'SELF_APPROVAL_NOT_ALLOWED'
        );
      }

      if (request.status === 'pending') {
        // Warehouse manager approves a supervisor-originated request directly
        // into wm_approved (skip dept manager / forward / admin-approve chain).
        if (user?.role === 'sub_warehouse_manager') {
          return materialRequestsRepository.updateStatus(client, requestId, 'wm_approved', {
            dept_approved_by: approvedBy,
          });
        }
        // Department manager approves their department's request. Separation of
        // duties: a department manager may never approve their OWN request —
        // the request must come from the warehouse manager of their department.
        return materialRequestsRepository.updateStatus(client, requestId, 'dept_approved', {
          dept_approved_by: approvedBy,
        });
      }

      if (request.status === 'forwarded') {
        // The forwarded → admin_approved step is permission-gated
        // (requests:approve). The system administrator no longer holds it after
        // Phase 2, so this transition is unreachable via HTTP for legacy data.
        return materialRequestsRepository.updateStatus(client, requestId, 'admin_approved', {
          approved_by: approvedBy,
        });
      }

      throw new ValidationError(`Cannot approve a request with status '${request.status}'`, { status: request.status });
    });
  }

  /** Department manager forwards a dept-approved request to the admin layer. */
  async forwardRequest(requestId: number, forwardedBy: number, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findByIdForUpdate(client, requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      if (user && !this.inScope(request, user)) {
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }
      this.assertPermission(user, PERMISSIONS.REQUESTS_FORWARD);

      if (request.status !== 'dept_approved') {
        throw new ValidationError(
          `Cannot forward a request with status '${request.status}'. It must be approved by the department first.`,
          { status: request.status }
        );
      }

      return materialRequestsRepository.updateStatus(client, requestId, 'forwarded', {
        forwarded_by: forwardedBy,
      });
    });
  }

  async rejectRequest(requestId: number, rejectedBy: number, reason: string, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findByIdForUpdate(client, requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      if (user && !this.inScope(request, user)) {
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }
      this.assertPermission(user, PERMISSIONS.REQUESTS_REJECT);

      // D13: a sub-warehouse manager rejects a request BEFORE it is approved.
      // Pending requests land in wm_rejected (never issued). Legacy forwarded
      // requests are still rejected into admin_rejected. An already-approved
      // request can NEVER be rejected — that would silently discard a stock
      // decision (conflict, 409).
      if (request.status === 'pending') {
        return materialRequestsRepository.updateStatus(client, requestId, 'wm_rejected', {
          rejected_by: rejectedBy,
          rejection_reason: reason,
        });
      }
      if (request.status === 'forwarded') {
        return materialRequestsRepository.updateStatus(client, requestId, 'admin_rejected', {
          rejected_by: rejectedBy,
          rejection_reason: reason,
        });
      }
      if (['wm_approved', 'dept_approved', 'admin_approved'].includes(request.status)) {
        throw new ConflictError(
          `Cannot reject a request with status '${request.status}'. It has already been approved.`,
          'REQUEST_ALREADY_APPROVED',
          { status: request.status }
        );
      }
      throw new ValidationError(`Cannot reject a request with status '${request.status}'`, { status: request.status });
    });
  }

  async issueRequest(requestId: number, issuedBy: number, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      // Row-lock the request so two concurrent issues are serialized: the
      // second one blocks here and then observes status 'issued' below.
      const request = await materialRequestsRepository.findByIdForUpdate(client, requestId);
      if (!request) {
        logger.warn('[ISSUE_FAILED] Request not found', 'material-requests', { requestId, issuedBy });
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }
      if (user && !this.inScope(request, user)) {
        logger.warn('[ISSUE_FAILED] Request out of scope', 'material-requests', {
          requestId, issuedBy, requestDept: request.department_id, requestWh: request.warehouse_id,
        });
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }
      this.assertPermission(user, PERMISSIONS.REQUESTS_ISSUE);

      // The sub-warehouse manager issues supervisor-originated requests from
      // wm_approved. The historical admin_approved issue path is kept for
      // legacy data but is permission-gated: the system administrator holds no
      // requests:* permission after Phase 2, so it is unreachable via HTTP.
      if (user?.role === 'sub_warehouse_manager') {
        if (request.status !== 'wm_approved') {
          logger.warn('[ISSUE_FAILED] Invalid status for WM issue', 'material-requests', {
            requestId, issuedBy, requestStatus: request.status, expectedStatus: 'wm_approved',
          });
          throw new ValidationError(
            `Cannot issue a request with status '${request.status}'. Warehouse managers can only issue requests that have been approved for them (wm_approved).`,
            { status: request.status },
            'INVALID_REQUEST_STATUS'
          );
        }
      } else {
        if (request.status !== 'admin_approved') {
          logger.warn('[ISSUE_FAILED] Invalid status for admin issue', 'material-requests', {
            requestId, issuedBy, requestStatus: request.status, expectedStatus: 'admin_approved',
          });
          throw new ValidationError(
            `Cannot issue a request with status '${request.status}'. It must be approved by the warehouse admin first.`,
            { status: request.status },
            'INVALID_REQUEST_STATUS'
          );
        }
      }

      // 1. The destination (department) warehouse must belong to the request's
      //    department — never issue into an unrelated warehouse.
      const destWarehouse = await warehousesRepository.findById(request.warehouse_id);
      if (!destWarehouse || destWarehouse.department_id !== request.department_id) {
        logger.warn('[ISSUE_FAILED] Destination warehouse department mismatch', 'material-requests', {
          requestId, issuedBy, warehouseId: request.warehouse_id, requestDept: request.department_id,
          destDept: destWarehouse?.department_id ?? null,
        });
        throw new ValidationError(
          'The destination warehouse does not belong to the request department',
          { warehouse_id: request.warehouse_id, department_id: request.department_id },
          'WAREHOUSE_SCOPE_ERROR'
        );
      }

      // 2. Stock is sourced from the DEPARTMENT'S MAIN WAREHOUSE — never from
      //    request.warehouse_id directly.
      const mainWarehouse = await warehousesRepository.findMainByDepartment(request.department_id);
      if (!mainWarehouse) {
        logger.warn('[ISSUE_FAILED] No main warehouse for department', 'material-requests', {
          requestId, issuedBy, requestDept: request.department_id, requestWh: request.warehouse_id,
        });
        throw new ValidationError(
          `Department #${request.department_id} has no main warehouse configured; cannot issue stock`,
          { department_id: request.department_id },
          'NO_MAIN_WAREHOUSE'
        );
      }
      if (mainWarehouse.id === request.warehouse_id) {
        logger.warn('[ISSUE_FAILED] Request targets main warehouse', 'material-requests', {
          requestId, issuedBy, mainWarehouseId: mainWarehouse.id, requestWh: request.warehouse_id,
        });
        throw new ValidationError(
          'The request targets the main warehouse itself; choose a department warehouse to receive the stock',
          { warehouse_id: request.warehouse_id },
          'MAIN_WAREHOUSE_DESTINATION'
        );
      }

      const details = await materialRequestsRepository.findDetailsByRequestId(requestId, client);

      // 3. Create the LN (Issue Note) draft referencing the receiving department
      //    warehouse. Stock movement is performed below via the locked transfer.
      const transaction = await transactionsService.createDraft(
        {
          type: 'LN',
          department_id: request.department_id,
          warehouse_id: request.warehouse_id,
          created_by: issuedBy,
          notes: `Auto-generated from Request ${request.request_no}`,
        },
        details.map((d: any) => ({
          item_id: d.item_id,
          quantity: d.quantity,
          unit_code: d.unit_code,
          unit_price: 0,
          batch_number: null,
        })),
        client
      );
      const txnId = transaction.id!;

      // 4. Transfer stock MAIN -> DEPARTMENT with row-level locking. The items
      //    row lock serializes concurrent issues of different requests so the
      //    main warehouse can never be overdrawn.
      for (const d of details as any[]) {
        const item = await itemsRepository.findByIdForUpdate(client, d.item_id);
        if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND', { id: d.item_id });

        const quantity = Number(d.quantity) || 0;
        if (quantity <= 0) {
          throw new ValidationError(`Request line for item #${d.item_id} must have a positive quantity`, { item_id: d.item_id });
        }

        const mainStock = await itemsRepository.getWarehouseStock(client, item.id, mainWarehouse.id);
        const sourceBalance = mainStock
          ? Number(mainStock.current_balance) || 0
          : (item.warehouse_id === mainWarehouse.id ? Number(item.current_balance) || 0 : 0);

        if (sourceBalance < quantity) {
          logger.warn('[ISSUE_FAILED] Insufficient stock', 'material-requests', {
            requestId, issuedBy, itemId: item.id, itemCode: item.item_code,
            mainWarehouseId: mainWarehouse.id, available: sourceBalance, required: quantity,
          });
          throw new ValidationError(
            `Insufficient stock in main warehouse '${mainWarehouse.name_ar || mainWarehouse.code}' for item ${item.item_code}. Available: ${sourceBalance}, Required: ${quantity}`,
            { item_code: item.item_code, available: sourceBalance, required: quantity },
            'INSUFFICIENT_STOCK'
          );
        }

        const destStock = await itemsRepository.getWarehouseStock(client, item.id, request.warehouse_id);
        const destBalance = destStock ? Number(destStock.current_balance) || 0 : 0;

        const newMainBalance = Number((sourceBalance - quantity).toFixed(4));
        const newDestBalance = Number((destBalance + quantity).toFixed(4));

        // MAIN WAREHOUSE: quantity -= requested quantity
        await itemsRepository.upsertWarehouseStock(client, item.id, mainWarehouse.id, newMainBalance);
        await stockMovementsRepository.logMovement(client, {
          item_id: item.id,
          transaction_id: txnId,
          movement_type: 'OUT',
          quantity_before: sourceBalance,
          quantity_change: -quantity,
          quantity_after: newMainBalance,
          user_id: issuedBy,
          warehouse_id: mainWarehouse.id,
        });

        // DEPARTMENT WAREHOUSE: quantity += requested quantity
        await itemsRepository.upsertWarehouseStock(client, item.id, request.warehouse_id, newDestBalance);
        await stockMovementsRepository.logMovement(client, {
          item_id: item.id,
          transaction_id: txnId,
          movement_type: 'IN',
          quantity_before: destBalance,
          quantity_change: quantity,
          quantity_after: newDestBalance,
          user_id: issuedBy,
          warehouse_id: request.warehouse_id,
        });

        // Keep the legacy items.current_balance pointing at the item's PRIMARY
        // warehouse balance (stock lives centrally in the main warehouse).
        const primaryNew =
          item.warehouse_id === mainWarehouse.id ? newMainBalance
          : item.warehouse_id === request.warehouse_id ? newDestBalance
          : Number(item.current_balance) || 0;
        await itemsRepository.setPrimaryBalance(client, item.id, primaryNew);
      }

      // 5. Approve the LN header (stock movement already recorded above).
      await transactionsRepository.updateStatus(client, txnId, 'approved', issuedBy);

      // 6. Create custody records for non-consumable (durable) items
      for (const d of details as any[]) {
        if (d.is_consumable === false) {
          await custodiesRepository.create(client, {
            item_id: d.item_id,
            warehouse_id: request.warehouse_id,
            assigned_to: request.requested_by,
            quantity: d.quantity,
            unit_code: d.unit_code,
            issued_transaction_id: txnId,
            request_id: requestId,
            project_id: request.project_id,
            notes: `Auto-generated custody from Request ${request.request_no}`,
          });
        }
      }

      // 7. Update request status to issued
      await materialRequestsRepository.updateStatus(client, requestId, 'issued', {
        issued_by: issuedBy,
        transaction_id: txnId,
      });

      return { message: 'Request issued successfully', transaction_id: txnId };
    });
  }

  async cancelRequest(requestId: number, cancelledBy: number, cancellerRole?: string, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findByIdForUpdate(client, requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      // State machine: cancellable until admin approval (admin_approved is only
      // cancellable by a user holding requests:cancel, before the stock is
      // actually issued).
      const cancellableByOwner = ['pending', 'dept_approved', 'wm_approved', 'forwarded'].includes(request.status);
      const cancellableByCancelRole = ['pending', 'dept_approved', 'wm_approved', 'forwarded', 'admin_approved'].includes(request.status);

      // Ownership check: only the system administrator master-canceller (additionally
      // guarded by the requests:cancel permission when the caller provides a
      // user context) may cancel someone else's request; every other user may
      // only cancel their own cancellable requests. The system administrator
      // lost requests:cancel in Phase 2, so its admin-cancel path is unreachable
      // via HTTP.
      const hasCancelPermission = user?.permissions.includes(PERMISSIONS.REQUESTS_CANCEL) ?? true;
      const isAdmin = cancellerRole === 'admin' && hasCancelPermission;
      if (isAdmin) {
        if (!cancellableByCancelRole) {
          throw new ValidationError(`Cannot cancel a request with status '${request.status}'`, { status: request.status }, 'INVALID_REQUEST_STATUS');
        }
      } else {
        // The owner can cancel their own request regardless of department scope.
        if (!cancellableByOwner || request.requested_by !== cancelledBy) {
          throw new AppError('You are not authorized to cancel this request', 403, 'AUTH_FORBIDDEN');
        }
      }

      return materialRequestsRepository.updateStatus(client, requestId, 'cancelled');
    });
  }
}

export const materialRequestsService = new MaterialRequestsService();
