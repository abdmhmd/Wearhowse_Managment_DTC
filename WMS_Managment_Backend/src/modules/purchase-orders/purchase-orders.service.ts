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
  type PurchaseOrderStatus,
} from './purchase-orders.types';
import type { CreatePoInput, PoLineInput } from './purchase-orders.repository';
import { transactionsService } from '../transactions/transactions.service';
import { itemsRepository } from '../items/items.repository';
import { unitConversionsRepository } from '../unit-conversions/unit-conversions.repository';
import { warehousesRepository } from '../warehouses/warehouses.repository';

export class PurchaseOrdersService {
  /**
   * View/mutation scope for a single PO. Out-of-scope resources are hidden as
   * 404 (project convention — see custodies/material-requests services).
   * A sub_warehouse_manager may act on a PO only when its receiving warehouse
   * is personally assigned via user_warehouses — whether the manager is
   * department-assigned (DEPARTMENT scope) or not (WAREHOUSE scope).
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
    }
    if (scope === 'DEPARTMENT') {
      // Department-assigned sub_warehouse_manager (mandatory production shape):
      // ONLY personally assigned warehouses via user_warehouses are in scope —
      // never the whole department, never the department main warehouse. Zero
      // assigned warehouses fails closed to 404.
      if (user.warehouse_ids.includes(po.warehouse_id)) return;
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

  async getAll(page = 1, limit = 20, filters: { status?: string; supplier_name?: string; warehouse_id?: number; search?: string }, user?: AuthUserContext) {
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
   *   warehouse, optional supplier name, optional per-line unit price.
   * - sub_warehouse_manager expresses a pure MATERIAL REQUEST: item + quantity +
   *   unit (+ notes). The receiving main warehouse is DERIVED SERVER-SIDE
   *   from the authenticated user (department main warehouse first, then a
   *   uniquely-assigned main via user_warehouses). Client-supplied
   *   warehouse_id / department_id / supplier_name / unit_price are IGNORED —
   *   a forged payload can never steer procurement.
   */
  async create(
    data: Omit<CreatePoInput, 'created_by' | 'department_id' | 'warehouse_id'> & { warehouse_id?: number | null },
    user?: AuthUserContext
  ): Promise<any> {
    if (!user) throw new AppError('Authentication required', 401);

    const isManagerCreator = user.role === 'sub_warehouse_manager';
    let receivingWarehouseId = data.warehouse_id;
    let supplierName = data.supplier_name ?? null;
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
      supplierName = null;                                // ignore client supplier name
      lines = lines.map(l => ({ ...l, unit_price: 0 }));  // ignore client prices
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
    // System admins creating a purchase order must specify a supplier name.
    if (!isManagerCreator) {
      const cleanName = supplierName == null ? null : supplierName.trim();
      supplierName = cleanName && cleanName.length > 0 ? cleanName : null;
      if (!supplierName) {
        throw new ValidationError(
          'A purchase order from a system administrator must name the supplier. For internal transfers, use a material disbursement request instead.',
          { supplier_name: null },
          'SUPPLIER_REQUIRED_FOR_ADMIN_PO'
        );
      }
    }

    // Lines: items must exist and be active; units valid per item.
    await this.validateLines(lines);

    return runInTransaction(async (client) => {
      const po_number = await repo.generatePoNumber(client);
      const header = await repo.insertHeader(client, {
        ...data,
        warehouse_id: receivingWarehouseId,
        lines,
        supplier_name: supplierName,
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

  async update(id: number, data: Partial<Pick<CreatePoInput, 'supplier_name' | 'warehouse_id' | 'expected_date' | 'order_date' | 'notes' | 'lines'>>, user?: AuthUserContext): Promise<any> {
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

      if (data.supplier_name !== undefined) {
        const cleanName = data.supplier_name == null ? null : data.supplier_name.trim();
        fields.supplier_name = cleanName && cleanName.length > 0 ? cleanName : '';
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

      await repo.updateStatus(client, id, 'cancelled', {
        cancelled_by: user!.id,
        cancelled_at: new Date(),
      });

      logger.info(`[PO_CANCELLED] PO ${po.po_number} cancelled by user ${user!.id}`, 'purchase-orders');
      return this.loadFullPo(client, id);
    });
  }

  /**
   * Close a fully received PO once nothing is pending. For PR-linked purchase
   * orders D8 auto-creates a draft Transfer to the request creator's
   * sub-warehouse; the PO may only be closed after that transfer has been
   * CONFIRMED (approved) by a second user, so the received stock is no longer
   * sitting unassigned in the receiving main warehouse.
   */
  async close(id: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

      if (!canTransition(po.status, 'closed')) {
        throw new ValidationError(`Cannot close a purchase order with status '${po.status}' — it must be fully received first`, { status: po.status }, 'INVALID_PURCHASE_ORDER_STATUS');
      }

      // [D8] A PR-linked PO carries draft auto-transfers until a second user
      // confirms them (each partial receive drafts one TRF). Closing would
      // leave the drafted movement dangling, so confirm every draft TRF first.
      const pendingTrf = await client.query(
        `SELECT id, transaction_no FROM transactions
          WHERE purchase_order_id = $1 AND type = 'TRF' AND status = 'draft'
          ORDER BY id`,
        [id]
      );
      if (pendingTrf.rows.length > 0) {
        throw new ValidationError(
          'Cannot close: an auto-created transfer has not been confirmed yet. Confirm the linked transfer(s) first.',
          { transfer_ids: pendingTrf.rows.map((r) => r.id) },
          'PO_CANNOT_CLOSE'
        );
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

      // [D8] PR-linked purchase orders: auto-create a DRAFT Transfer to the
      // request creator's sub-warehouse for the quantities just received.
      // Anything here either commits with (or rolls back) the RV above — the
      // movement is only realised when a second user confirms it. Standalone
      // POs (not generated from a purchase request) are never auto-transferred:
      // their received stock simply stays in the main warehouse as general stock.
      let linkedTransfer: { id?: number; transaction_no?: string } | null = null;
      let transferDestination: { id: number; code: string } | null = null;

      const prRes = await client.query(
        `SELECT id, request_no, department_id, warehouse_id, created_by, status
           FROM purchase_requests WHERE purchase_order_id = $1`,
        [id]
      );
      const pr = prRes.rows[0];
      if (pr && pr.status === 'admin_approved') {
        // Destination = the request creator's UNIQUE active non-main warehouse
        // in the same department (derived via user_warehouses). Zero or several
        // matches fail the receive so the RV is rolled back — the movement
        // destination must never be guessed.
        const destRes = await client.query(
          `SELECT w.id, w.code, w.name_ar, w.name_en, w.department_id
             FROM warehouses w
             JOIN user_warehouses uw ON uw.warehouse_id = w.id
            WHERE uw.user_id = $1 AND w.department_id = $2
              AND w.is_active = true AND w.is_main = false
            ORDER BY w.id`,
          [pr.created_by, pr.department_id]
        );
        const destinations = destRes.rows;
        if (destinations.length === 0) {
          throw new ValidationError(
            'Cannot auto-transfer this receipt: the purchase request creator has no active sub-warehouse assigned in the department.',
            { request_no: pr.request_no },
            'NO_TRANSFER_DESTINATION'
          );
        }
        if (destinations.length > 1) {
          throw new ValidationError(
            'Cannot auto-transfer this receipt: the purchase request creator is assigned multiple sub-warehouses in the department.',
            { request_no: pr.request_no, warehouse_ids: destinations.map((d: any) => d.id) },
            'AMBIGUOUS_TRANSFER_DESTINATION'
          );
        }
        const dest = destinations[0];
        transferDestination = dest;

        const trfHeader = await transactionsService.createDraft(
          {
            type: 'TRF',
            department_id: pr.department_id ?? po.department_id,
            warehouse_id: po.warehouse_id,
            to_warehouse_id: dest.id,
            purchase_order_id: po.id,
            created_by: user!.id,
            notes: `Auto-generated from Purchase Order ${po.po_number} for Purchase Request ${pr.request_no}`,
          },
          payload.lines.map((line) => {
            const detail = detailMap.get(line.detail_id)!;
            return {
              item_id: detail.item_id,
              quantity: line.quantity,
              unit_code: detail.unit_code,
              unit_price: 0,
              batch_number: null,
            };
          }),
          client
        );
        await client.query(
          `UPDATE purchase_orders
           SET linked_transfer_id = $2, auto_transfer_created = true
           WHERE id = $1`,
          [id, trfHeader.id]
        );
        linkedTransfer = trfHeader;
      }

      logger.info(
        `[PO_RECEIVED] PO ${po.po_number} received via RV ${rvHeader.transaction_no}${linkedTransfer ? `; auto-TRF ${linkedTransfer.transaction_no}` : ''}`,
        'purchase-orders'
      );

      return {
        message: 'Stock received successfully',
        transaction_id: rvHeader.id,
        transaction_no: rvHeader.transaction_no,
        status: newStatus,
        auto_transfer_created: !!linkedTransfer,
        linked_transfer_id: linkedTransfer?.id ?? null,
        linked_transfer_no: linkedTransfer?.transaction_no ?? null,
        linked_transfer_destination_warehouse_id: transferDestination?.id ?? null,
        linked_transfer_destination_warehouse_code: transferDestination?.code ?? null,
      };
    });
  }

  // ── [NP3] Explicit Confirmation for Inbound Movement ─────────────────────

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

      // D9: two-party confirmation — the user who created the PO may not
      // confirm its own receipt.
      if (user && po.created_by === user.id) {
        throw new ForbiddenError(
          'Cannot confirm receipt of a purchase order you created. Another user must confirm it.',
          { po_id: id, created_by: po.created_by }
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

  /**
   * [D8] Confirm the auto-created transfer(s) of a PR-linked purchase order.
   * Approving the linked TRF(s) realises the movement: stock leaves the
   * receiving MAIN warehouse and enters the request creator's sub-warehouse.
   * Every draft TRF drafted for this PO is confirmed in the same transaction
   * (a partially received PO drafts one TRF per receive call). D9 two-party
   * confirmation — the user who drafted a transfer (the receiver) may not
   * confirm their own movement.
   */
  async confirmTransfer(id: number, user?: AuthUserContext): Promise<any> {
    return runInTransaction(async (client) => {
      const po = await repo.findHeaderByIdForUpdate(client, id);
      if (!po) throw new NotFoundError('PurchaseOrder', 'PURCHASE_ORDER_NOT_FOUND');
      this.assertPoInScope(po, user);

      if (!['received', 'partially_received'].includes(po.status)) {
        throw new ValidationError(
          `Cannot confirm a transfer for a purchase order with status '${po.status}'. It must be received first.`,
          { status: po.status },
          'INVALID_PURCHASE_ORDER_STATUS'
        );
      }

      if (po.linked_transfer_id == null) {
        throw new ValidationError(
          'This purchase order has no linked transfer to confirm.',
          { po_id: id },
          'NO_LINKED_TRANSFER'
        );
      }

      // Confirm EVERY draft auto-transfer belonging to this PO. A partially
      // received PO drafts one TRF per receive, so only chasing the latest
      // linked_transfer_id would leave earlier drafts dangling forever.
      const trfRes = await client.query(
        `SELECT id, transaction_no, created_by, status FROM transactions
          WHERE purchase_order_id = $1 AND type = 'TRF' AND status = 'draft'
          ORDER BY id`,
        [id]
      );
      const trfs = trfRes.rows;
      if (trfs.length === 0) {
        throw new ConflictError(
          'There are no draft transfers left to confirm for this purchase order.',
          'LINKED_TRANSFER_ALREADY_CONFIRMED',
          { po_id: id }
        );
      }

      for (const trf of trfs) {
        // D9 two-party: the receiver who drafted the transfer cannot confirm it.
        if (user && trf.created_by === user.id) {
          throw new ForbiddenError(
            'Cannot confirm a transfer you created yourself. Another user must confirm it.',
            { po_id: id, transfer_created_by: trf.created_by }
          );
        }
        await transactionsService.approveTransaction(trf.id, user!.id, client);
      }
      const lastTrf = trfs[trfs.length - 1];

      logger.info(
        `[PO_TRANSFER_CONFIRMED] PO ${po.po_number} confirmed ${trfs.length} linked TRF(s) (${trfs.map((t) => t.transaction_no).join(', ')}) by user ${user!.id}`,
        'purchase-orders'
      );

      return {
        message: 'Transfer confirmed successfully',
        transaction_id: lastTrf.id,
        transaction_no: lastTrf.transaction_no,
        transfer_count: trfs.length,
        status: 'approved',
        transfer_confirmed_by: user!.id,
        transfer_confirmed_at: new Date(),
        po: await this.loadFullPo(client, id),
      };
    });
  }

  /** Load the full PO (header + details) using an existing client. */
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
    return { ...headerRes.rows[0], details: detailsRes.rows };
  }
}

// Header select shared between the service's transactional reload and the
// repository select (fields mirrored in purchase-orders.repository PO_SELECT).
const REPO_SELECT = `
  SELECT po.id, po.po_number, NULLIF(po.supplier_name, '') AS supplier_name, po.warehouse_id, po.department_id,
         po.status, po.order_date, po.expected_date, po.notes,
         po.created_by, po.approved_by, po.approved_at,
         po.cancelled_by, po.cancelled_at, po.received_at, po.is_active,
         po.receive_confirmed_by, po.receive_confirmed_at,
         po.created_at, po.updated_at,
         w.is_main AS warehouse_is_main, w.code AS warehouse_code,
         w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
         d.code AS department_code, d.name_ar AS department_name_ar, d.name_en AS department_name_en,
         -- Auto-PO linkage: which purchase request generated this PO (1-to-1).
         preq.id AS purchase_request_id,
         preq.request_no AS purchase_request_no,
         -- [D8] Auto-created transfer linkage (draft TRF -> Sub-WH confirm).
         po.linked_transfer_id,
         po.auto_transfer_created,
         lt.transaction_no AS linked_transfer_no,
         lt.status::text AS linked_transfer_status,
         ltw.id AS linked_transfer_dest_warehouse_id,
         ltw.code AS linked_transfer_dest_warehouse_code,
         ltw.name_ar AS linked_transfer_dest_warehouse_name_ar,
         ltw.name_en AS linked_transfer_dest_warehouse_name_en
FROM purchase_orders po
   JOIN warehouses w ON w.id = po.warehouse_id
   LEFT JOIN departments d ON d.id = po.department_id
   LEFT JOIN users ru ON ru.id = po.receive_confirmed_by
   LEFT JOIN purchase_requests preq ON preq.purchase_order_id = po.id
   LEFT JOIN transactions lt ON lt.id = po.linked_transfer_id
   LEFT JOIN warehouses ltw ON ltw.id = lt.to_warehouse_id
   WHERE po.id = $1 AND po.is_active = true`;

export const purchaseOrdersService = new PurchaseOrdersService();
