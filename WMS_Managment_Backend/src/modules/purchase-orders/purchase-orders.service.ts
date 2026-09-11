import { pool, runInTransaction } from '../../config/database';
import { PoolClient } from 'pg';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError, AppError } from '../../utils/AppError';
import { scopeForUser } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';
import { logger } from '../../utils/logger';
import { purchaseOrdersRepository as repo } from './purchase-orders.repository';
import {
  canTransition,
  RECEIVABLE_STATUSES,
  ALLOCATABLE_STATUSES,
  type PurchaseOrderStatus,
} from './purchase-orders.types';
import type { CreatePoInput, PoLineInput } from './purchase-orders.repository';
import { transactionsService } from '../transactions/transactions.service';
import { itemsRepository } from '../items/items.repository';
import { unitConversionsRepository } from '../unit-conversions/unit-conversions.repository';
import { warehousesRepository } from '../warehouses/warehouses.repository';
import { getStockAvailability } from './stock-availability';

export class PurchaseOrdersService {
  /**
   * View/mutation scope for a single PO. Out-of-scope resources are hidden as
   * 404 (project convention — see custodies/material-requests services).
   * A sub_warehouse_manager additionally sees POs whose receiving warehouse
   * belongs to his department (department-derived procurement requests).
   */
  private assertPoInScope(
    po: { warehouse_id: number; department_id?: number | null },
    user?: AuthUserContext
  ): void {
    if (!user) return;
    const scope = scopeForUser(user);
    if (scope === 'GLOBAL') return;
    if (scope === 'WAREHOUSE') {
      if (user.warehouse_ids.includes(po.warehouse_id)) return;
      // Department-derived requests: a manager sees POs of his own
      // department's main warehouse even without an explicit assignment.
      if (
        user.role === 'sub_warehouse_manager' &&
        user.department_id != null &&
        po.department_id === user.department_id
      ) return;
    }
    throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
  }

  private async isUnitValidForItem(itemId: number, defaultUnit: string, unitCode: string): Promise<boolean> {
    if (!unitCode) return false;
    if (unitCode === defaultUnit) return true;
    // [NP4-UNIT-H] Piece unit (H) requires no conversion — always valid as-is
    if (unitCode === 'H') return true;
    const conversions = await unitConversionsRepository.findByItemId(itemId);
    return conversions.some(c => c.from_unit_code === defaultUnit && c.to_unit_code === unitCode);
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  async getAll(page = 1, limit = 20, filters: { status?: string; supplier_id?: number; warehouse_id?: number; search?: string }, user?: AuthUserContext) {
    const { items, total } = await repo.findAll(page, limit, filters, user);
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: number, user?: AuthUserContext) {
    const po = await repo.findById(id);
    if (!po || !user) {
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      return po;
    }
    this.assertPoInScope(po, user);
    return po;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  /**
   * Role-aware creation.
   *
   * - admin keeps full procurement control: explicit receiving main
   *   warehouse, optional supplier, optional per-line unit price.
   * - sub_warehouse_manager expresses a pure MATERIAL REQUEST: item + quantity +
   *   unit (+ notes). The receiving main warehouse is DERIVED SERVER-SIDE
   *   from the authenticated user (department main warehouse first, then a
   *   uniquely-assigned main via user_warehouses). Client-supplied
   *   warehouse_id / department_id / supplier_id / unit_price are IGNORED —
   *   a forged payload can never steer procurement.
   */
  async create(
    data: Omit<CreatePoInput, 'created_by' | 'department_id' | 'warehouse_id'> & { warehouse_id?: number | null },
    user?: AuthUserContext
  ): Promise<any> {
    if (!user) throw new AppError('Authentication required', 401);

    const isManagerCreator = user.role === 'sub_warehouse_manager';
    let receivingWarehouseId = data.warehouse_id;
    let supplierId = data.supplier_id ?? null;
    let lines = data.lines;

    if (isManagerCreator) {
      // ── Derive the receiving main warehouse from the AUTHENTICATED user ──
      // Rule 1: the manager's department main warehouse.
      // Rule 2 (fallback): a UNIQUELY assigned active main warehouse.
      let derived: { id: number } | null = null;
      if (user.department_id != null) {
        derived = await warehousesRepository.findMainByDepartment(user.department_id);
        if (!derived) {
          throw new ValidationError(
            'Your department does not have an active main warehouse to receive purchases. Contact your administrator.',
            { department_id: user.department_id },
            'NO_MAIN_WAREHOUSE'
          );
        }
      } else {
        const mainsRes = await pool.query(
          `SELECT DISTINCT w.id FROM warehouses w
             JOIN user_warehouses uw ON uw.warehouse_id = w.id
            WHERE uw.user_id = $1 AND w.is_main = true AND w.is_active = true`,
          [user.id]
        );
        if (mainsRes.rows.length === 1) {
          derived = { id: mainsRes.rows[0].id };
        } else if (mainsRes.rows.length === 0) {
          throw new ValidationError(
            'The warehouse manager does not have a valid main warehouse assigned',
            undefined,
            'NO_MAIN_WAREHOUSE'
          );
        } else {
          throw new ValidationError(
            'Ambiguous warehouse assignment: multiple main warehouses are assigned to this account',
            { warehouse_ids: mainsRes.rows.map((r: any) => r.id) }
          );
        }
      }
      receivingWarehouseId = derived.id;

      // The request stage carries NO procurement data.
      supplierId = null;                                   // ignore client supplier
      lines = lines.map(l => ({ ...l, unit_price: 0 }));   // ignore client prices
    }

    if (!receivingWarehouseId) {
      throw new ValidationError('warehouse_id is required', {});
    }

    // Receiving warehouse must be an active MAIN warehouse.
    const whRes = await pool.query(
      'SELECT id, code, department_id, is_main, is_active FROM warehouses WHERE id = $1 AND is_active = true',
      [receivingWarehouseId]
    );
    const warehouse = whRes.rows[0];
    if (!warehouse) throw new ValidationError('The selected receiving warehouse does not exist', { warehouse_id: receivingWarehouseId });
    if (!warehouse.is_main) {
      throw new ValidationError('Purchase orders must receive into a MAIN warehouse', { warehouse_id: receivingWarehouseId }, 'MAIN_WAREHOUSE_REQUIRED');
    }
    // department_id is DERIVED from the receiving warehouse — never trusted
    // from the client payload.
    const departmentId: number | null = warehouse.department_id ?? null;

    // [NP7-DISBURSEMENT-VS-PURCHASE]
    // Purchase Orders are strictly for external procurement from a supplier.
    // Internal inter-warehouse movements are always material requests (disbursement).
    // System admins creating a purchase order must specify an active supplier.
    if (!isManagerCreator) {
      if (!supplierId) {
        throw new ValidationError(
          'A purchase order from a system administrator must be linked to a supplier. For internal transfers, use a material disbursement request instead.',
          { supplier_id: null },
          'SUPPLIER_REQUIRED_FOR_ADMIN_PO'
        );
      }
      const supRes = await pool.query('SELECT id FROM suppliers WHERE id = $1 AND is_active = true', [supplierId]);
      if (!supRes.rows[0]) throw new ValidationError('Supplier not found or inactive', { supplier_id: supplierId });
    }

    // Lines: items must exist and be active; units valid per item.
    await this.validateLines(lines);

    return runInTransaction(async (client) => {
      const po_number = await repo.generatePoNumber(client);
      const header = await repo.insertHeader(client, {
        ...data,
        warehouse_id: receivingWarehouseId,
        lines,
        supplier_id: supplierId,
        expected_date: data.expected_date ?? null,
        notes: data.notes ?? null,
        order_date: data.order_date ?? null,
        department_id: departmentId,
        created_by: user.id,
        po_number,
      });
      await repo.insertDetails(client, header.id, lines);
      logger.info(
        `[PO_CREATED] ${po_number} by user ${user.id} (${user.role}) -> WH ${receivingWarehouseId}${isManagerCreator ? ' (warehouse auto-derived)' : ''}`,
        'purchase-orders'
      );
      return this.loadFullPo(client, header.id);
    });
  }

  async update(id: number, data: Partial<Pick<CreatePoInput, 'supplier_id' | 'warehouse_id' | 'expected_date' | 'order_date' | 'notes' | 'lines'>>, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

        if (po.status !== 'draft') {
        throw new ConflictError(
          `Only draft purchase orders can be edited (current status: ${po.status})`,
          'INVALID_PURCHASE_ORDER_STATUS',
          { status: po.status }
        );
      }
      if (!user) throw new AppError('Authentication required', 401);
  
      const fields: Record<string, any> = {};

      if (data.supplier_id !== undefined) {
        if (data.supplier_id !== null) {
          const supRes = await client.query('SELECT id FROM suppliers WHERE id = $1 AND is_active = true', [data.supplier_id]);
          if (!supRes.rows[0]) throw new ValidationError('Supplier not found or inactive', { supplier_id: data.supplier_id });
        }
        fields.supplier_id = data.supplier_id;
      }

      if (data.warehouse_id !== undefined && data.warehouse_id !== po.warehouse_id) {
        const whRes = await client.query(
          'SELECT id, code, department_id, is_main, is_active FROM warehouses WHERE id = $1 AND is_active = true',
          [data.warehouse_id]
        );
        const wh = whRes.rows[0];
        if (!wh) throw new ValidationError('The selected receiving warehouse does not exist', { warehouse_id: data.warehouse_id });
        if (!wh.is_main) throw new ValidationError('Purchase orders must receive into a MAIN warehouse', { warehouse_id: data.warehouse_id }, 'MAIN_WAREHOUSE_REQUIRED');
        if (user.role === 'sub_warehouse_manager' && !user.warehouse_ids.includes(data.warehouse_id)) {
          throw new ForbiddenError('The selected warehouse is not assigned to you');
        }
        fields.warehouse_id = data.warehouse_id;
        fields.department_id = wh.department_id ?? null;
      }

      if (data.expected_date !== undefined) fields.expected_date = data.expected_date;
      if (data.order_date !== undefined) fields.order_date = data.order_date;
      if (data.notes !== undefined) fields.notes = data.notes;

      if (Object.keys(fields).length > 0) {
        await repo.updateHeader(client, id, fields);
      }

      if (data.lines !== undefined) {
        if (data.lines.length === 0) throw new ValidationError('A purchase order must contain at least one item line', {});
        await this.validateLines(data.lines);
        await repo.deleteDetails(client, id);
        await repo.insertDetails(client, id, data.lines);
      }

      return this.loadFullPo(client, id);
    });
  }

  private async validateLines(lines: PoLineInput[]): Promise<void> {
    for (const line of lines) {
      const item = await pool.query('SELECT id, item_code, unit_code FROM items WHERE id = $1 AND is_active = true', [line.item_id]);
      if (!item.rows[0]) throw new ValidationError(`Item #${line.item_id} not found or inactive`, { item_id: line.item_id });
      if (!(await this.isUnitValidForItem(line.item_id, item.rows[0].unit_code, line.unit_code))) {
        throw new ValidationError(
          `Unit '${line.unit_code}' is not valid for item '${item.rows[0].item_code}'. Default unit is '${item.rows[0].unit_code}'.`,
          { item_id: line.item_id, unit_code: line.unit_code }
        );
      }
    }
  }

  // ── Status machine ───────────────────────────────────────────────────────

  async approve(id: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

      if (!canTransition(po.status, 'approved')) {
        throw new ValidationError(`Cannot approve a purchase order with status '${po.status}'`, { status: po.status }, 'INVALID_PURCHASE_ORDER_STATUS');
      }

      const linesRes = await client.query('SELECT COUNT(*)::int AS n FROM purchase_order_details WHERE po_id = $1', [id]);
      if (linesRes.rows[0].n === 0) {
        throw new ValidationError('A purchase order must contain at least one item line before approval', {});
      }

      await repo.updateStatus(client, id, 'approved', {
        approved_by: user!.id,
        approved_at: new Date(),
      });

      logger.info(`[PO_APPROVED] PO ${po.po_number} approved by user ${user!.id}`, 'purchase-orders');
      return this.loadFullPo(client, id);
    });
  }

  async cancel(id: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

      if (!['draft', 'approved', 'partially_received'].includes(po.status)) {
        throw new ValidationError(`Cannot cancel a purchase order with status '${po.status}'`, { status: po.status }, 'INVALID_PURCHASE_ORDER_STATUS');
      }

      // Once physical stock has been received the PO may only be cancelled
      // when no open reservations remain (they reference the received stock).
      if (['partially_received', 'received'].includes(po.status)) {
        const openRes = await client.query(
          `SELECT COALESCE(SUM(quantity_allocated - quantity_transferred), 0)::float8 AS open_qty
           FROM purchase_order_allocations WHERE po_id = $1 AND status IN ('allocated', 'partially_transferred')`,
          [id]
        );
        if (Number(openRes.rows[0].open_qty) > 0) {
          throw new ValidationError(
            'Cannot cancel: received stock still has open allocations. Transfer or cancel the allocations first.',
            { open_allocations: Number(openRes.rows[0].open_qty) }
          );
        }
      }

      await repo.updateStatus(client, id, 'cancelled', {
        cancelled_by: user!.id,
        cancelled_at: new Date(),
      });

      logger.info(`[PO_CANCELLED] PO ${po.po_number} cancelled by user ${user!.id}`, 'purchase-orders');
      return this.loadFullPo(client, id);
    });
  }

  /**
   * Close a fully received PO once nothing is pending: every allocation fully
   * transferred/cancelled and every allocated unit moved out of the main
   * warehouse. Unallocated received stock intentionally stays in the main
   * warehouse as general stock.
   */
  async close(id: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

      if (!canTransition(po.status, 'closed')) {
        throw new ValidationError(`Cannot close a purchase order with status '${po.status}' — it must be fully received first`, { status: po.status }, 'INVALID_PURCHASE_ORDER_STATUS');
      }

      const openRes = await client.query(
        `SELECT COALESCE(SUM(quantity_allocated - quantity_transferred), 0)::float8 AS open_qty
         FROM purchase_order_allocations WHERE po_id = $1 AND status IN ('allocated', 'partially_transferred')`,
        [id]
      );
      if (Number(openRes.rows[0].open_qty) > 0) {
        throw new ValidationError('Cannot close: allocations are still open (not fully transferred)', {
          open_allocations: Number(openRes.rows[0].open_qty),
        }, 'PO_CANNOT_CLOSE');
      }

      await repo.updateStatus(client, id, 'closed');
      return this.loadFullPo(client, id);
    });
  }

  // ── Receiving ────────────────────────────────────────────────────────────

  async receive(
    id: number,
    payload: { lines: Array<{ detail_id: number; quantity: number; unit_price?: number; batch_number?: string }> },
    user?: AuthUserContext
  ): Promise<any> {
    return runInTransaction(async (client) => {
      // 1. Lock the PO header row.
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

      // 2. Status gate.
      if (!RECEIVABLE_STATUSES.includes(po.status)) {
        throw new ValidationError(`Cannot receive against a purchase order with status '${po.status}'`, { status: po.status });
      }

      // 3. Lock and validate every detail line BEFORE touching stock.
      const detailMap = new Map<number, any>();
      for (const line of payload.lines) {
        const detail = await repo.findDetailByIdForUpdate(client, line.detail_id);
        if (!detail || detail.po_id !== id) {
          throw new NotFoundError('PurchaseOrderLine', 'PO_LINE_NOT_FOUND', { detail_id: line.detail_id });
        }
        const remaining = Number(detail.quantity_ordered) - Number(detail.quantity_received);
        if (Number(line.quantity) > remaining) {
          throw new ValidationError(
            `Receiving ${line.quantity} exceeds the remaining ordered quantity (${remaining}) for item #${detail.item_id}`,
            { detail_id: line.detail_id, ordered: Number(detail.quantity_ordered), already_received: Number(detail.quantity_received), attempted: Number(line.quantity) },
            'RECEIVE_EXCEEDS_ORDERED'
          );
        }
        detailMap.set(line.detail_id, detail);
      }

      // 4. RV voucher through the EXISTING transactions engine (same DB tx).
      //    approveTransaction performs: balance increase in
      //    item_warehouse_stock, IN stock_movements leg, batch creation and
      //    journal entry. Any failure rolls back everything below with it.
      const rvHeader = await transactionsService.createDraft(
        {
          type: 'RV',
          supplier_id: po.supplier_id,
          department_id: po.department_id,
          warehouse_id: po.warehouse_id,
          purchase_order_id: po.id,
          created_by: user!.id,
          notes: `Auto-generated from Purchase Order ${po.po_number}`,
        },
        payload.lines.map((line) => {
          const detail = detailMap.get(line.detail_id)!;
          return {
            item_id: detail.item_id,
            quantity: line.quantity,
            unit_code: detail.unit_code,
            unit_price: line.unit_price ?? Number(detail.unit_price) ?? 0,
            batch_number: line.batch_number ?? null,
          };
        }),
        client
      );
      await transactionsService.approveTransaction(rvHeader.id!, user!.id, client);

      // 5. Update cumulative quantities + derive the new PO status.
      let allReceived = true;
      for (const line of payload.lines) {
        await client.query(
          `UPDATE purchase_order_details
           SET quantity_received = quantity_received + $2,
               unit_price = CASE WHEN $3::decimal IS NULL THEN unit_price ELSE $3::decimal END
           WHERE id = $1`,
          [line.detail_id, line.quantity, line.unit_price ?? null]
        );
      }
      const details = await repo.findDetailsByPoId(id, client);
      for (const d of details) {
        if (Number(d.quantity_received) < Number(d.quantity_ordered)) allReceived = false;
      }
      const newStatus: PurchaseOrderStatus = allReceived ? 'received' : 'partially_received';
      await repo.updateStatus(client, id, newStatus);

      // [NP5-RECEIVE-TIMESTAMP] Record first-receipt timestamp from supplier
      await client.query(
        `UPDATE purchase_orders SET received_at = COALESCE(received_at, NOW()) WHERE id = $1`,
        [id]
      );

      logger.info(`[PO_RECEIVED] PO ${po.po_number} received via RV ${rvHeader.transaction_no}`, 'purchase-orders');

      return {
        message: 'Stock received successfully',
        transaction_id: rvHeader.id,
        transaction_no: rvHeader.transaction_no,
        status: newStatus,
      };
    });
  }

  // ── Allocation (reservation only — NO physical movement) ────────────────

  async allocate(
    id: number,
    payload: { detail_id: number; dest_warehouse_id: number; quantity: number },
    user?: AuthUserContext
  ): Promise<any> {
    return runInTransaction(async (client) => {
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

      if (!ALLOCATABLE_STATUSES.includes(po.status)) {
        throw new ValidationError(`Cannot allocate from a purchase order with status '${po.status}' — it must be approved and received first`, { status: po.status });
      }

      const detail = await repo.findDetailByIdForUpdate(client, payload.detail_id);
      if (!detail || detail.po_id !== id) {
        throw new NotFoundError('PurchaseOrderLine', 'PO_LINE_NOT_FOUND', { detail_id: payload.detail_id });
      }

      const received = Number(detail.quantity_received);
      if (received <= 0) {
        throw new ValidationError('Nothing has been received for this line yet — receive stock before allocating', { detail_id: payload.detail_id }, 'ALLOCATE_EXCEEDS_RECEIVED');
      }

      // Cumulative safety invariant: allocated_total + new <= received.
      const allocatable = received - Number(detail.quantity_allocated);
      if (Number(payload.quantity) > allocatable) {
        throw new ValidationError(
          `Allocation exceeds the allocatable quantity. Received: ${received}, already allocated: ${Number(detail.quantity_allocated)}, allocatable remaining: ${allocatable}`,
          { detail_id: payload.detail_id, received, allocated: Number(detail.quantity_allocated), requested: Number(payload.quantity), available: allocatable },
          'ALLOCATE_EXCEEDS_AVAILABLE'
        );
      }

      // Destination warehouse: active NON-MAIN department warehouse.
      const dwRes = await client.query(
        'SELECT id, code, name_ar, name_en, department_id, is_main, is_active FROM warehouses WHERE id = $1 AND is_active = true',
        [payload.dest_warehouse_id]
      );
      const dest = dwRes.rows[0];
      if (!dest) throw new ValidationError('Destination warehouse does not exist', { dest_warehouse_id: payload.dest_warehouse_id });
      if (dest.is_main) {
        throw new ValidationError('Allocation destination cannot be a main warehouse', { dest_warehouse_id: payload.dest_warehouse_id }, 'MAIN_WAREHOUSE_DESTINATION');
      }
      if (dest.department_id == null) {
        throw new ValidationError('Destination warehouse is not linked to a department', { dest_warehouse_id: payload.dest_warehouse_id });
      }
      if (po.department_id != null && dest.department_id !== po.department_id) {
        throw new ValidationError('Destination warehouse does not belong to the purchase order department', {
          dest_warehouse_id: payload.dest_warehouse_id,
          dest_department: dest.department_id,
          po_department: po.department_id,
        }, 'INVALID_DESTINATION_WAREHOUSE');
      }
      if (user!.role === 'sub_warehouse_manager' && !user!.warehouse_ids.includes(payload.dest_warehouse_id)) {
        throw new ForbiddenError('Destination warehouse is not assigned to you');
      }

      // Availability overlay: open reservations across ALL purchase orders must
      // never exceed the physical balance of the source warehouse.
      const availability = await getStockAvailability(detail.item_id, po.warehouse_id, client);
      if (availability.available_stock < Number(payload.quantity)) {
        throw new ValidationError(
          `Insufficient available stock in the source warehouse. Physical: ${availability.physical_stock}, reserved: ${availability.allocated_stock}, available: ${availability.available_stock}, requested: ${payload.quantity}`,
          { ...availability, requested: payload.quantity }
        );
      }

      // Latest receiving voucher for traceability.
      const lastRv = await client.query(
        `SELECT MAX(id) AS id FROM transactions WHERE purchase_order_id = $1 AND type = 'RV' AND status = 'approved'`,
        [id]
      );

      const allocation = await repo.insertAllocation(client, {
        po_detail_id: detail.id,
        po_id: id,
        source_warehouse_id: po.warehouse_id,
        dest_warehouse_id: payload.dest_warehouse_id,
        quantity_allocated: payload.quantity,
        receive_transaction_id: lastRv.rows[0]?.id ?? null,
        allocated_by: user!.id,
      });
      await repo.incrementDetailAllocated(client, detail.id, payload.quantity);

      logger.info(
        `[PO_ALLOCATED] PO ${po.po_number}: ${payload.quantity} x item#${detail.item_id} reserved -> WH ${payload.dest_warehouse_id}`,
        'purchase-orders'
      );

      return allocation;
    });
  }

  // ── Transfer (physical move MAIN -> destination) ─────────────────────────

  async transferAllocation(allocationId: number, quantity: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      // 1. Lock the allocation row (source/dest/PO ids loaded from the row —
      //    never from the client).
      const allocation = await repo.findAllocationByIdForUpdate(client, allocationId);
      if (!allocation) throw new NotFoundError('Allocation', 'ALLOCATION_NOT_FOUND');
      this.assertPoInScope({ warehouse_id: allocation.source_warehouse_id }, user);

      if (!['allocated', 'partially_transferred'].includes(allocation.status)) {
        throw new ValidationError(`Cannot transfer an allocation with status '${allocation.status}'`, { status: allocation.status },
          allocation.status === 'transferred' ? 'ALLOCATION_ALREADY_TRANSFERRED' : 'INVALID_PURCHASE_ORDER_STATUS');
      }

      const remaining = Number(allocation.quantity_allocated) - Number(allocation.quantity_transferred);
      if (quantity > remaining) {
        throw new ValidationError(
          `Transfer exceeds the remaining allocated quantity (${remaining})`,
          { allocation_id: allocationId, allocated: Number(allocation.quantity_allocated), transferred: Number(allocation.quantity_transferred), requested: quantity },
          'TRANSFER_EXCEEDS_ALLOCATED'
        );
      }

      // 2. TRF voucher through the EXISTING engine: approveTransaction's TRF
      //    branch deducts the source iws balance under lock, credits the
      //    destination, logs both movement legs and posts the transfer journal
      //    entry — inside THIS transaction.
      const detail = await repo.findDetailByIdForUpdate(client, allocation.po_detail_id);
      const trfHeader = await transactionsService.createDraft(
        {
          type: 'TRF',
          department_id: allocation.po_department_id,
          warehouse_id: allocation.source_warehouse_id,
          to_warehouse_id: allocation.dest_warehouse_id,
          purchase_order_id: allocation.po_id,
          created_by: user!.id,
          notes: `Auto-generated from Purchase Order ${allocation.po_number} allocation #${allocation.id}`,
        },
        [
          {
            item_id: detail.item_id,
            quantity,
            unit_code: detail.unit_code,
            unit_price: 0,
            batch_number: null,
          },
        ],
        client
      );
      await transactionsService.approveTransaction(trfHeader.id!, user!.id, client);

      // 3. Allocation bookkeeping.
      const newTransferred = Number(allocation.quantity_transferred) + quantity;
      const newStatus = newTransferred >= Number(allocation.quantity_allocated)
        ? 'transferred'
        : 'partially_transferred';
      await client.query(
        `UPDATE purchase_order_allocations
         SET quantity_transferred = $2, status = $3::allocation_status,
             transferred_by = $4, transferred_at = NOW(), transfer_transaction_id = $5
         WHERE id = $1`,
        [allocationId, newTransferred, newStatus, user!.id, trfHeader.id!]
      );

      // 4. Parent aggregates.
      await repo.incrementDetailTransferred(client, allocation.po_detail_id, quantity);

      logger.info(
        `[PO_TRANSFERRED] Allocation #${allocationId}: ${quantity} moved via TRF ${trfHeader.transaction_no}`,
        'purchase-orders'
      );

      return {
        message: 'Stock transferred successfully',
        allocation_id: allocationId,
        transaction_id: trfHeader.id,
        transaction_no: trfHeader.transaction_no,
        status: newStatus,
        quantity_transferred: newTransferred,
        remaining: Number(allocation.quantity_allocated) - newTransferred,
      };
    });
  }

  // ── Allocation Cancellation / Deallocation ──────────────────────────────

  async cancelAllocation(allocationId: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const allocation = await repo.findAllocationByIdForUpdate(client, allocationId);
      if (!allocation) throw new NotFoundError('Allocation', 'ALLOCATION_NOT_FOUND');
      this.assertPoInScope({ warehouse_id: allocation.source_warehouse_id }, user);

      if (!['allocated', 'partially_transferred'].includes(allocation.status)) {
        throw new ValidationError(
          `Cannot cancel an allocation with status '${allocation.status}'`,
          { status: allocation.status },
          'INVALID_ALLOCATION_STATUS'
        );
      }

      // Quantity that was reserved but NOT transferred
      const unTransferredQty = Number(allocation.quantity_allocated) - Number(allocation.quantity_transferred);

      // Decrement detail's quantity_allocated by the unTransferred amount
      if (unTransferredQty > 0) {
        await client.query(
          `UPDATE purchase_order_details
           SET quantity_allocated = GREATEST(quantity_allocated - $2, 0)
           WHERE id = $1`,
          [allocation.po_detail_id, unTransferredQty]
        );
      }

      if (Number(allocation.quantity_transferred) === 0) {
        // Nothing was transferred: the reservation is fully released. The row
        // cannot hold quantity_allocated = 0 (CHECK quantity_allocated > 0),
        // so a full cancellation removes the allocation row entirely.
        await client.query('DELETE FROM purchase_order_allocations WHERE id = $1', [allocationId]);
      } else {
        // Partially transferred: clamp the reservation down to the quantity
        // actually moved (keeps quantity_allocated > 0).
        await client.query(
          `UPDATE purchase_order_allocations
           SET status = 'cancelled'::allocation_status,
               quantity_allocated = quantity_transferred
           WHERE id = $1`,
          [allocationId]
        );
      }

      logger.info(
        `[PO_ALLOCATION_CANCELLED] Allocation #${allocationId} cancelled by user ${user?.id ?? 'system'} (released ${unTransferredQty})`,
        'purchase-orders'
      );

      return {
        message: 'Allocation cancelled successfully',
        allocation_id: allocationId,
        released_quantity: unTransferredQty,
      };
    });
  }

  // ── [NP3] Explicit Confirmations for Inbound & Outbound Movements ────────

  async confirmReceive(id: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

      if (!['received', 'partially_received'].includes(po.status)) {
        throw new ValidationError(
          `Cannot confirm receipt for a purchase order with status '${po.status}'. It must be received first.`,
          { status: po.status },
          'INVALID_PURCHASE_ORDER_STATUS'
        );
      }

      await client.query(
        `UPDATE purchase_orders
         SET receive_confirmed_by = $2, receive_confirmed_at = NOW()
         WHERE id = $1`,
        [id, user!.id]
      );

      logger.info(`[PO_RECEIVE_CONFIRMED] PO ${po.po_number} receipt confirmed by user ${user!.id}`, 'purchase-orders');
      return this.loadFullPo(client, id);
    });
  }

  async confirmTransfer(allocationId: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const allocation = await repo.findAllocationByIdForUpdate(client, allocationId);
      if (!allocation) throw new NotFoundError('Allocation', 'ALLOCATION_NOT_FOUND');
      this.assertPoInScope({ warehouse_id: allocation.source_warehouse_id }, user);

      if (!['transferred', 'partially_transferred'].includes(allocation.status)) {
        throw new ValidationError(
          `Cannot confirm transfer for an allocation with status '${allocation.status}'. It must be transferred first.`,
          { status: allocation.status },
          'INVALID_ALLOCATION_STATUS'
        );
      }

      await client.query(
        `UPDATE purchase_order_allocations
         SET transfer_confirmed_by = $2, transfer_confirmed_at = NOW()
         WHERE id = $1`,
        [allocationId, user!.id]
      );

      logger.info(
        `[PO_TRANSFER_CONFIRMED] Allocation #${allocationId} transfer confirmed by user ${user!.id}`,
        'purchase-orders'
      );

      return {
        message: 'Transfer confirmed successfully',
        allocation_id: allocationId,
        transfer_confirmed_by: user!.id,
        transfer_confirmed_at: new Date(),
      };
    });
  }

  /** Load the full PO (header + details + allocations) using an existing client. */
  private async loadFullPo(client: PoolClient, id: number): Promise<any> {
    // findById uses the module pool; reuse its SQL by delegating after commit
    // would break atomicity guarantees for callers wanting the final state, so
    // re-run the same queries on the transaction client instead.
    const headerRes = await client.query(`${REPO_SELECT}`, [id]);
    if (!headerRes.rows[0]) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
    const detailsRes = await client.query(
      `SELECT pod.*, i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en
       FROM purchase_order_details pod JOIN items i ON i.id = pod.item_id
       WHERE pod.po_id = $1 ORDER BY pod.id`,
      [id]
    );
    const allocationsRes = await client.query(
      `SELECT poa.*, i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en
       FROM purchase_order_allocations poa
       JOIN purchase_order_details pod ON pod.id = poa.po_detail_id
       JOIN items i ON i.id = pod.item_id
       WHERE poa.po_id = $1 ORDER BY poa.id`,
      [id]
    );
    return { ...headerRes.rows[0], details: detailsRes.rows, allocations: allocationsRes.rows };
  }
}

// Header select shared between repository findAll/findById and the service's
// transactional reload. Kept identical to PO_SELECT in the repository.
const REPO_SELECT = `
  SELECT po.*, w.is_main AS warehouse_is_main, w.code AS warehouse_code,
         w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
         s.name_ar AS supplier_name_ar, s.name_en AS supplier_name_en,
         d.code AS department_code, d.name_ar AS department_name_ar, d.name_en AS department_name_en
  FROM purchase_orders po
  LEFT JOIN suppliers s ON s.id = po.supplier_id
  JOIN warehouses w ON w.id = po.warehouse_id
  LEFT JOIN departments d ON d.id = po.department_id
  WHERE po.id = $1 AND po.is_active = true`;

export const purchaseOrdersService = new PurchaseOrdersService();
