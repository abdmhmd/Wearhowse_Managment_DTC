import { runInTransaction } from '../../config/database';
import { materialRequestsRepository, MaterialRequestDetail, RequestType } from './material-requests.repository';
import { transactionsService } from '../transactions/transactions.service';
import { transactionsRepository } from '../transactions/transactions.repository';
import { itemsRepository } from '../items/items.repository';
import { stockMovementsRepository } from '../stock-movements/stock-movements.repository';
import { warehousesRepository } from '../warehouses/warehouses.repository';
import { custodiesRepository } from '../custodies/custodies.repository';
import { NotFoundError, ValidationError, AppError } from '../../utils/AppError';
import { scopeForUser, type DataScope } from '../authorization/scope';
import { PERMISSIONS } from '../authorization/permissions';
import type { AuthUserContext } from '../authorization/authorization.service';

/**
 * Material request workflow (enforced by the repository/service state machine):
 *
 *   pending  --(dept manager approves)-->  dept_approved
 *   dept_approved --(dept manager forwards)--> forwarded
 *   forwarded --(admin approves)--> admin_approved --(admin issues)--> issued
 *   forwarded / pending --(admin rejects)--> admin_rejected
 *   pending / dept_approved / forwarded / admin_approved --(cancel)--> cancelled
 *
 * - department_manager approves and forwards ONLY requests of their own department
 *   (requests:approve / requests:forward).
 * - system_admin drives the final steps: approve (of forwarded requests), reject
 *   and issue (requests:approve / requests:reject / requests:issue).
 */
export class MaterialRequestsService {

  async createRequest(
    requestedBy: number,
    data: {
      department_id: number;
      warehouse_id: number;
      request_type?: RequestType;
      project_id?: number | null;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      needed_by?: string;
      notes?: string;
      items: Array<{ item_id: number; quantity: number; unit_code: string; notes?: string }>;
    },
    user?: AuthUserContext
  ) {
    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Request must have at least one item', {});
    }

    if (user) {
      const scope: DataScope = scopeForUser(user);
      // A department_manager is the APPROVAL layer, never the creator: the
      // intended creator is the warehouse_manager of the department warehouse
      // (or the system_admin). Enforced server-side so a hand-crafted payload
      // (or a future permission regrant) cannot bypass it.
      if (scope === 'DEPARTMENT') {
        throw new ValidationError('Only warehouse managers or system administrators can create material requests', {});
      }
      if (scope === 'WAREHOUSE' && !user.warehouse_ids.includes(data.warehouse_id)) {
        throw new ValidationError('You can only create requests against a warehouse you are assigned to', { warehouse_id: data.warehouse_id });
      }
      // Fail closed: a user with no resolvable department/warehouse scope
      // (e.g. a warehouse_manager with zero warehouse assignments) may not
      // create material requests at all.
      if (scope === 'NONE') {
        throw new ValidationError('You are not authorized to create material requests', {});
      }
    }

    // The destination warehouse must belong to the request's department. This is
    // enforced server-side so a department_manager (or warehouse_manager) can
    // never reference another department's warehouse, even with a hand-crafted
    // payload. system_admin may reference any warehouse of the chosen department.
    if (user && scopeForUser(user) !== 'GLOBAL') {
      const wh = await warehousesRepository.findById(data.warehouse_id);
      if (!wh || wh.department_id !== data.department_id) {
        throw new ValidationError(
          'The selected warehouse does not belong to the request department',
          { warehouse_id: data.warehouse_id, department_id: data.department_id }
        );
      }
    }

    return runInTransaction(async (client) => {
      const request_no = await materialRequestsRepository.generateRequestNo();

      const header = await materialRequestsRepository.create(client, {
        request_no,
        department_id: data.department_id,
        warehouse_id: data.warehouse_id,
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
          unit_code: item.unit_code,
          notes: item.notes ?? null,
        });
        details.push(detail);
      }

      return { ...header, details };
    });
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

  private assertAdmin(user?: AuthUserContext) {
    if (user && user.role !== 'system_admin') {
      throw new AppError('Only the system administrator can perform this action', 403, 'AUTH_FORBIDDEN');
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
   * Department-level approval of a 'pending' request (department_manager /
   * system_admin) OR admin approval of a 'forwarded' request (system_admin).
   */
  async approveRequest(requestId: number, approvedBy: number, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findByIdForUpdate(client, requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      if (user && !this.inScope(request, user)) {
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }

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
        // Department manager approves their department's request. Separation of
        // duties: a department manager may never approve their OWN request —
        // the request must come from the warehouse manager of their department.
        return materialRequestsRepository.updateStatus(client, requestId, 'dept_approved', {
          dept_approved_by: approvedBy,
        });
      }

      if (request.status === 'forwarded') {
        // Warehouse admin approves the forwarded request.
        this.assertAdmin(user);
        return materialRequestsRepository.updateStatus(client, requestId, 'admin_approved', {
          approved_by: approvedBy,
        });
      }

      throw new ValidationError(`Cannot approve a request with status '${request.status}'`, { status: request.status });
    });
  }

  /** Department manager forwards a dept-approved request to the warehouse admin. */
  async forwardRequest(requestId: number, forwardedBy: number, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      const request = await materialRequestsRepository.findByIdForUpdate(client, requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      if (user && !this.inScope(request, user)) {
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }

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

      // Admin rejection: allowed while the request is forwarded to the admin,
      // or while it is still awaiting department approval (early rejection).
      if (request.status !== 'forwarded' && request.status !== 'pending') {
        throw new ValidationError(`Cannot reject a request with status '${request.status}'`, { status: request.status });
      }
      if (request.status === 'forwarded') this.assertAdmin(user);

      return materialRequestsRepository.updateStatus(client, requestId, 'admin_rejected', {
        rejected_by: rejectedBy,
        rejection_reason: reason,
      });
    });
  }

  async issueRequest(requestId: number, issuedBy: number, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      // Row-lock the request so two concurrent issues are serialized: the
      // second one blocks here and then observes status 'issued' below.
      const request = await materialRequestsRepository.findByIdForUpdate(client, requestId);
      if (!request) throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      if (user && !this.inScope(request, user)) {
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }
      this.assertAdmin(user);

      if (request.status !== 'admin_approved') {
        throw new ValidationError(
          `Cannot issue a request with status '${request.status}'. It must be approved by the warehouse admin first.`,
          { status: request.status }
        );
      }

      // 1. The destination (department) warehouse must belong to the request's
      //    department — never issue into an unrelated warehouse.
      const destWarehouse = await warehousesRepository.findById(request.warehouse_id);
      if (!destWarehouse || destWarehouse.department_id !== request.department_id) {
        throw new ValidationError(
          'The destination warehouse does not belong to the request department',
          { warehouse_id: request.warehouse_id, department_id: request.department_id }
        );
      }

      // 2. Stock is sourced from the DEPARTMENT'S MAIN WAREHOUSE — never from
      //    request.warehouse_id directly.
      const mainWarehouse = await warehousesRepository.findMainByDepartment(request.department_id);
      if (!mainWarehouse) {
        throw new ValidationError(
          `Department #${request.department_id} has no main warehouse configured; cannot issue stock`,
          { department_id: request.department_id }
        );
      }
      if (mainWarehouse.id === request.warehouse_id) {
        throw new ValidationError(
          'The request targets the main warehouse itself; choose a department warehouse to receive the stock',
          { warehouse_id: request.warehouse_id }
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
          throw new ValidationError(
            `Insufficient stock in main warehouse '${mainWarehouse.name_ar || mainWarehouse.code}' for item ${item.item_code}. Available: ${sourceBalance}, Required: ${quantity}`,
            { item_code: item.item_code, available: sourceBalance, required: quantity }
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
      if (user && !this.inScope(request, user)) {
        throw new NotFoundError('MaterialRequest', 'REQUEST_NOT_FOUND', { id: requestId });
      }

      // State machine: cancellable until admin approval (admin_approved is only
      // cancellable by an admin, before the stock is actually issued).
      const cancellableByOwner = ['pending', 'dept_approved', 'forwarded'].includes(request.status);
      const cancellableByAdmin = ['pending', 'dept_approved', 'forwarded', 'admin_approved'].includes(request.status);
      if (!cancellableByOwner && !cancellableByAdmin) {
        throw new ValidationError(`Cannot cancel a request with status '${request.status}'`, { status: request.status });
      }

      // Ownership check: only system_admin may cancel someone else's request;
      // every other user may only cancel their own cancellable requests.
      const isAdmin = cancellerRole === 'system_admin';
      if (isAdmin) {
        if (!cancellableByAdmin) {
          throw new ValidationError(`Cannot cancel a request with status '${request.status}'`, { status: request.status });
        }
      } else {
        if (!cancellableByOwner || request.requested_by !== cancelledBy) {
          throw new AppError('You are not authorized to cancel this request', 403, 'AUTH_FORBIDDEN');
        }
      }

      return materialRequestsRepository.updateStatus(client, requestId, 'cancelled');
    });
  }
}

export const materialRequestsService = new MaterialRequestsService();
