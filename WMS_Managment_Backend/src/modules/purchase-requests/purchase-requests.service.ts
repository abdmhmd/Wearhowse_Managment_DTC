import { runInTransaction } from '../../config/database';
import { pool } from '../../config/database';
import { purchaseRequestsRepository as repo } from './purchase-requests.repository';
import { purchaseOrdersRepository as poRepo } from '../purchase-orders/purchase-orders.repository';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../utils/AppError';
import { scopeForUser } from '../authorization/scope';
import { PERMISSIONS } from '../authorization/permissions';
import type { AuthUserContext } from '../authorization/authorization.service';
import { logger } from '../../utils/logger';
import { prCanTransition, type PurchaseRequestStatus } from './purchase-requests.types';

export class PurchaseRequestsService {
  // ── Authorization helpers (permission-based, never raw role checks) ──────

  private hasPermission(user: AuthUserContext, code: string): boolean {
    return user.permissions.includes(code);
  }

  /**
   * Data-scope check for a single request row.
   * - A requester (view_own) always sees their own requests.
   * - A view-permission holder sees all (admin) or their department's rows.
   */
  private canView(request: { id: number; created_by: number; department_id: number }, user: AuthUserContext): boolean {
    if (request.created_by === user.id) return true;
    if (this.hasPermission(user, PERMISSIONS.PURCHASE_REQUESTS_VIEW)) {
      const scope = scopeForUser(user);
      if (scope === 'GLOBAL') return true;
      if (scope === 'DEPARTMENT' && user.department_id != null && request.department_id === user.department_id) {
        return true;
      }
    }
    return false;
  }

  private assertCanView(request: any, user: AuthUserContext): void {
    if (!this.canView(request, user)) {
      throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id: request.id });
    }
  }

  /** Department-level scope guard: the row must belong to the caller's department. */
  private assertDeptInScope(request: any, user: AuthUserContext): void {
    if (user.department_id == null || request.department_id !== user.department_id) {
      throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id: request.id });
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getAll(filters: {
    status?: string;
    page?: number;
    limit?: number;
    user: AuthUserContext;
  }): Promise<{ items: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { items, total } = await repo.findAll(page, limit, { status: filters.status }, filters.user);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number, user: AuthUserContext): Promise<any> {
    const request = await repo.findById(id);
    if (!request) throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id });
    this.assertCanView(request, user);
    request.items = await repo.findItems(pool, id);
    return request;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(input: { warehouse_id: number; notes?: string | null; items: any[] }, user: AuthUserContext): Promise<any> {
    if (!user) throw new AppError('Authentication required', 401);
    if (!this.hasPermission(user, PERMISSIONS.PURCHASE_REQUESTS_CREATE)) {
      throw new ForbiddenError();
    }

    // Warehouse: must be an ACTIVE MAIN warehouse of the caller's department.
    // The auto-PO receives into this warehouse so the existing PO main-warehouse
    // trigger passes at approve-admin time (fail fast at creation).
    const whRes = await pool.query(
      'SELECT id, is_main, is_active, department_id FROM warehouses WHERE id = $1',
      [input.warehouse_id]
    );
    const warehouse = whRes.rows[0];
    if (!warehouse || !warehouse.is_active) {
      throw new ValidationError('The selected warehouse does not exist', { warehouse_id: input.warehouse_id }, 'WAREHOUSE_NOT_FOUND');
    }
    if (!warehouse.is_main) {
      throw new ValidationError('Purchase requests must target the department MAIN warehouse', { warehouse_id: input.warehouse_id }, 'MAIN_WAREHOUSE_REQUIRED');
    }
    if (warehouse.department_id !== user.department_id) {
      throw new ValidationError('The warehouse does not belong to your department', { warehouse_id: input.warehouse_id, department_id: warehouse.department_id }, 'WAREHOUSE_DEPARTMENT_MISMATCH');
    }

    this.assertUserDepartment(user);

    // Items: must exist, be active and belong to the department; the unit code
    // must be a real unit.
    await this.validateItems(input.items, user.department_id!);

    return runInTransaction(async (client) => {
      const request_no = await repo.generateRequestNo(client);
      const header = await repo.create(client, {
        request_no,
        department_id: user.department_id!,
        warehouse_id: input.warehouse_id,
        created_by: user.id,
        notes: input.notes ?? null,
      });
      await repo.insertItems(client, header.id, input.items);
      logger.info(`[PR_CREATED] ${request_no} by user ${user.id} (${user.role}) -> WH ${input.warehouse_id}`, 'purchase-requests');
      return this.loadFull(client, header.id);
    });
  }

  // ── Status machine ────────────────────────────────────────────────────────

  async cancel(id: number, user: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const request = await repo.findHeaderByIdForUpdate(client, id);
      if (!request) throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id });
      this.assertCanView(request, user);

      // Creator-only cancellation.
      if (request.created_by !== user.id) {
        throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id });
      }
      this.assertTransition(request.status, 'cancelled');

      await repo.updateStatus(client, id, 'cancelled', {
        cancelled_by: user.id,
        cancelled_at: new Date(),
      });
      logger.info(`[PR_CANCELLED] PR #${id} cancelled by user ${user.id}`, 'purchase-requests');
      return this.loadFull(client, id);
    });
  }

  async approveDept(id: number, user: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const request = await repo.findHeaderByIdForUpdate(client, id);
      if (!request) throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id });
      this.assertDeptInScope(request, user);
      this.assertTransition(request.status, 'dept_approved');

      await repo.updateStatus(client, id, 'dept_approved', {
        dept_approved_by: user.id,
        dept_approved_at: new Date(),
      });
      logger.info(`[PR_DEPT_APPROVED] PR #${id} dept-approved by user ${user.id}`, 'purchase-requests');
      return this.loadFull(client, id);
    });
  }

  async rejectDept(id: number, reason: string, user: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const request = await repo.findHeaderByIdForUpdate(client, id);
      if (!request) throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id });
      this.assertDeptInScope(request, user);
      this.assertTransition(request.status, 'rejected');

      await repo.updateStatus(client, id, 'rejected', {
        rejected_by: user.id,
        rejection_reason: reason,
        rejected_at: new Date(),
      });
      logger.info(`[PR_REJECTED] PR #${id} rejected (dept) by user ${user.id}`, 'purchase-requests');
      return this.loadFull(client, id);
    });
  }

  /**
   * Admin-level approval. In a SINGLE transaction:
   *   1. requests.dept_approved -> admin_approved (with admin_approved_by/at);
   *   2. AUTO-PO created as a draft PO with supplier_name = '' for the
   *      request's main warehouse/department;
   *   3. every request item copied verbatim into purchase_order_details;
   *   4. purchase_requests.purchase_order_id linked to the new PO.
   * Any failure rolls the whole thing back — the request stays dept_approved
   * and no orphan PO is ever written.
   */
  async approveAdmin(id: number, user: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const request = await repo.findHeaderByIdForUpdate(client, id);
      if (!request) throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id });
      this.assertCanView(request, user);
      this.assertTransition(request.status, 'admin_approved');
      if (request.purchase_order_id != null) {
        throw new ConflictError(
          'This purchase request already generated a purchase order',
          'PURCHASE_REQUEST_ALREADY_PROCESSED',
          { purchase_order_id: request.purchase_order_id }
        );
      }
      if (!request.warehouse_is_main) {
        throw new ValidationError(
          'Auto-PO requires the request warehouse to be an active MAIN warehouse',
          { warehouse_id: request.warehouse_id },
          'MAIN_WAREHOUSE_REQUIRED'
        );
      }

      // 1. Transition the request.
      await repo.updateStatus(client, id, 'admin_approved', {
        admin_approved_by: user.id,
        admin_approved_at: new Date(),
      });

      // 2. Create the auto-PO (draft, supplier blank — the buyer names the
      // supplier at the PO stage).
      const po_number = await poRepo.generatePoNumber(client);
      const po = await poRepo.insertHeader(client, {
        po_number,
        supplier_name: '',
        warehouse_id: request.warehouse_id,
        department_id: request.department_id,
        order_date: new Date().toISOString(),
        expected_date: null,
        notes: `Auto-generated from Purchase Request ${request.request_no}`,
        created_by: user.id,
        lines: [],
      });

      // 3. Copy the request items into the PO.
      const items = await repo.findItems(client, id);
      await poRepo.insertDetails(
        client,
        po.id,
        items.map((it: any) => ({
          item_id: it.item_id,
          quantity_ordered: Number(it.quantity),
          unit_code: it.unit_code,
          unit_price: 0,
          notes: it.notes ?? null,
        }))
      );

      // 4. Link the PO back to the request.
      await repo.linkPurchaseOrder(client, id, po.id);

      logger.info(`[PR_ADMIN_APPROVED] PR #${id} admin-approved by user ${user.id}; AUTO-PO ${po_number} created`, 'purchase-requests');
      return this.loadFull(client, id);
    });
  }

  async rejectAdmin(id: number, reason: string, user: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const request = await repo.findHeaderByIdForUpdate(client, id);
      if (!request) throw new NotFoundError('PurchaseRequest', 'PURCHASE_REQUEST_NOT_FOUND', { id });
      this.assertCanView(request, user);
      this.assertTransition(request.status, 'rejected');

      await repo.updateStatus(client, id, 'rejected', {
        rejected_by: user.id,
        rejection_reason: reason,
        rejected_at: new Date(),
      });
      logger.info(`[PR_REJECTED] PR #${id} rejected (admin) by user ${user.id}`, 'purchase-requests');
      return this.loadFull(client, id);
    });
  }

  // ── Validation helpers ────────────────────────────────────────────────────

  private assertUserDepartment(user: AuthUserContext): void {
    if (user.department_id == null) {
      throw new ValidationError('Your account is not assigned to a department', {}, 'NO_DEPARTMENT');
    }
  }

  private assertTransition(from: PurchaseRequestStatus, to: PurchaseRequestStatus): void {
    if (!prCanTransition(from, to)) {
      throw new ConflictError(
        `Cannot transition a purchase request from '${from}' to '${to}'`,
        'PURCHASE_REQUEST_INVALID_STATUS',
        { from, to }
      );
    }
  }

  private async validateItems(items: any[], departmentId: number): Promise<void> {
    const itemIds = [...new Set(items.map((i) => i.item_id))];
    const itemRes = await pool.query(
      `SELECT i.id, i.item_code, i.unit_code
         FROM items i
        WHERE i.id = ANY($1::int[])
          AND i.is_active = true
          AND i.warehouse_id IN (SELECT w.id FROM warehouses w WHERE w.department_id = $2)`,
      [itemIds, departmentId]
    );
    const found = new Set<number>(itemRes.rows.map((r) => r.id));
    for (const line of items) {
      if (!found.has(line.item_id)) {
        throw new ValidationError(
          `Item #${line.item_id} not found, inactive, or does not belong to your department`,
          { item_id: line.item_id },
          'ITEM_INVALID'
        );
      }
    }

    // Units must be real (the copies land in purchase_order_details which has
    // a FK to units.code).
    const unitCodes = [...new Set(items.map((i) => i.unit_code))];
    const unitRes = await pool.query('SELECT code FROM units WHERE code = ANY($1::text[])', [unitCodes]);
    const unitSet = new Set<string>(unitRes.rows.map((r) => r.code));
    for (const line of items) {
      if (!unitSet.has(line.unit_code)) {
        throw new ValidationError(`Unit '${line.unit_code}' does not exist`, { unit_code: line.unit_code }, 'UNIT_INVALID');
      }
    }
  }

  private async loadFull(client: import('pg').PoolClient, id: number): Promise<any> {
    const header = await repo.findById(id, client);
    header.items = await repo.findItems(client, id);
    return header;
  }
}

export const purchaseRequestsService = new PurchaseRequestsService();