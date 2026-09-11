import { pool } from '../../config/database';
import { PoolClient } from 'pg';
import { scopeForUser } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';
import type { PurchaseOrderStatus } from './purchase-orders.types';

/**
 * Scope clause for purchase orders.
 *
 * - admin sees every PO (GLOBAL).
 * - sub_warehouse_manager sees only POs whose RECEIVING (main) warehouse is
 *   explicitly assigned to them; zero-assignment sub-warehouse managers
 *   resolve to FALSE (fail closed) — the material-request zero-assignment
 *   fallback does not apply to procurement.
 * - department_manager / supervisor hold no purchase-orders permissions, so
 *   they never reach this clause in practice; if a future grant is added,
 *   DEPARTMENT resolves to the department's warehouses.
 */
export function poScopeClause(user: AuthUserContext, startIndex = 1): { clause: string; params: any[] } {
  const scope = scopeForUser(user);
  let n = startIndex;
  if (scope === 'GLOBAL') return { clause: 'TRUE', params: [] };
  if (scope === 'WAREHOUSE') {
    // Assigned warehouses PLUS the manager's own department main warehouse
    // (department-derived procurement requests are visible to their creator).
    const parts: string[] = [];
    const params: any[] = [];
    if (user.warehouse_ids.length > 0) {
      parts.push(`po.warehouse_id = ANY($${n++})`);
      params.push(user.warehouse_ids);
    }
    if (user.department_id != null) {
      parts.push(`po.department_id = $${n++}`);
      params.push(user.department_id);
    }
    if (parts.length === 0) return { clause: 'FALSE', params: [] };
    return { clause: `(${parts.join(' OR ')})`, params };
  }
  return { clause: 'FALSE', params: [] };
}

export interface PoLineInput {
  item_id: number;
  quantity_ordered: number;
  unit_code: string;
  unit_price?: number;
  notes?: string | null;
}

export interface CreatePoInput {
  supplier_id?: number | null;
  warehouse_id: number;
  department_id: number | null;
  order_date?: string | null;
  expected_date?: string | null;
  notes?: string | null;
  created_by: number;
  lines: PoLineInput[];
}

export interface PurchaseOrderFilters {
  status?: string;
  supplier_id?: number;
  warehouse_id?: number;
  search?: string;
}

const PO_SELECT = `
  SELECT po.id, po.po_number, po.supplier_id, po.warehouse_id, po.department_id,
         po.status, po.order_date, po.expected_date, po.notes,
         po.created_by, po.approved_by, po.approved_at,
         po.cancelled_by, po.cancelled_at, po.received_at, po.is_active,
         po.created_at, po.updated_at,
         s.name_ar AS supplier_name_ar, s.name_en AS supplier_name_en,
         w.code AS warehouse_code, w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
         w.is_main AS warehouse_is_main,
         d.code AS department_code, d.name_ar AS department_name_ar, d.name_en AS department_name_en,
         cu.username AS created_by_username, cu.full_name AS created_by_name,
         au.full_name AS approved_by_name,
         xu.full_name AS cancelled_by_name,
         COALESCE(line_agg.lines_count, 0)::int          AS lines_count,
         COALESCE(line_agg.quantity_ordered, 0)          AS quantity_ordered,
         COALESCE(line_agg.quantity_received, 0)         AS quantity_received,
         COALESCE(line_agg.quantity_allocated, 0)        AS quantity_allocated,
         COALESCE(line_agg.quantity_transferred, 0)      AS quantity_transferred
  FROM purchase_orders po
  LEFT JOIN suppliers s ON s.id = po.supplier_id
  JOIN warehouses w ON w.id = po.warehouse_id
  LEFT JOIN departments d ON d.id = po.department_id
  LEFT JOIN users cu ON cu.id = po.created_by
  LEFT JOIN users au ON au.id = po.approved_by
  LEFT JOIN users xu ON xu.id = po.cancelled_by
  LEFT JOIN (
    SELECT po_id,
           COUNT(*)::int                AS lines_count,
           SUM(quantity_ordered)        AS quantity_ordered,
           SUM(quantity_received)       AS quantity_received,
           SUM(quantity_allocated)      AS quantity_allocated,
           SUM(quantity_transferred)    AS quantity_transferred
    FROM purchase_order_details
    GROUP BY po_id
  ) line_agg ON line_agg.po_id = po.id
`;

export class PurchaseOrdersRepository {
  async generatePoNumber(client?: PoolClient): Promise<string> {
    const q = client ?? pool;
    const res = await q.query("SELECT nextval('po_no_seq') AS seq");
    const year = new Date().getFullYear();
    return `PO-${year}-${String(res.rows[0].seq).padStart(6, '0')}`;
  }

  async findAll(
    page: number,
    limit: number,
    filters: PurchaseOrderFilters,
    user?: AuthUserContext
  ): Promise<{ items: any[]; total: number }> {
    let where = 'WHERE po.is_active = true';
    const params: any[] = [];
    let i = 1;

    if (filters.status) { where += ` AND po.status::text = $${i++}`; params.push(filters.status); }
    if (filters.supplier_id) { where += ` AND po.supplier_id = $${i++}`; params.push(filters.supplier_id); }
    if (filters.warehouse_id) { where += ` AND po.warehouse_id = $${i++}`; params.push(filters.warehouse_id); }
    if (filters.search) {
      where += ` AND (po.po_number ILIKE $${i} OR s.name_ar ILIKE $${i} OR s.name_en ILIKE $${i})`;
      params.push(`%${filters.search}%`);
      i++;
    }
    if (user) {
      const scope = poScopeClause(user, i);
      if (scope.clause !== 'TRUE') {
        where += ` AND (${scope.clause})`;
        params.push(...scope.params);
        i += scope.params.length;
      }
    }

    const offset = (page - 1) * limit;
    const [listRes, countRes] = await Promise.all([
      pool.query(`${PO_SELECT} ${where} ORDER BY po.created_at DESC LIMIT $${i++} OFFSET $${i++}`, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*)::int AS total FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id ${where}`, params),
    ]);
    return { items: listRes.rows, total: countRes.rows[0].total };
  }

  /** Header + details + allocations with display names. Returns null when not found or soft-deleted. */
  async findById(id: number): Promise<any | null> {
    const headerRes = await pool.query(`${PO_SELECT} WHERE po.id = $1 AND po.is_active = true`, [id]);
    const header = headerRes.rows[0];
    if (!header) return null;

    const detailsRes = await pool.query(
      `SELECT pod.*,
              i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en,
              u.code AS unit_code_label, u.name_ar AS unit_name_ar, u.name_en AS unit_name_en
       FROM purchase_order_details pod
       JOIN items i ON i.id = pod.item_id
       JOIN units u ON u.code = pod.unit_code
       WHERE pod.po_id = $1
       ORDER BY pod.id`,
      [id]
    );

    const allocationsRes = await pool.query(
      `SELECT poa.*,
              i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en,
              sw.code AS source_warehouse_code, sw.name_ar AS source_warehouse_name_ar, sw.name_en AS source_warehouse_name_en,
              dw.code AS dest_warehouse_code, dw.name_ar AS dest_warehouse_name_ar, dw.name_en AS dest_warehouse_name_en,
              ab.full_name AS allocated_by_name,
              tb.full_name AS transferred_by_name,
              t.transaction_no AS transfer_transaction_no
       FROM purchase_order_allocations poa
       JOIN purchase_order_details pod ON pod.id = poa.po_detail_id
       JOIN items i ON i.id = pod.item_id
       JOIN warehouses sw ON sw.id = poa.source_warehouse_id
       JOIN warehouses dw ON dw.id = poa.dest_warehouse_id
       LEFT JOIN users ab ON ab.id = poa.allocated_by
       LEFT JOIN users tb ON tb.id = poa.transferred_by
       LEFT JOIN transactions t ON t.id = poa.transfer_transaction_id
       WHERE poa.po_id = $1
       ORDER BY poa.id`,
      [id]
    );

    return { ...header, details: detailsRes.rows, allocations: allocationsRes.rows };
  }

  async findHeaderById(id: number): Promise<any | null> {
    const res = await pool.query(`SELECT po.*, w.is_main AS warehouse_is_main, w.department_id AS warehouse_department_id
      FROM purchase_orders po JOIN warehouses w ON w.id = po.warehouse_id
      WHERE po.id = $1 AND po.is_active = true`, [id]);
    return res.rows[0] || null;
  }

  async findHeaderByIdForUpdate(client: PoolClient, id: number): Promise<any | null> {
    const res = await client.query(
      `SELECT po.*, w.is_main AS warehouse_is_main, w.department_id AS warehouse_department_id
       FROM purchase_orders po JOIN warehouses w ON w.id = po.warehouse_id
       WHERE po.id = $1 AND po.is_active = true FOR UPDATE OF po`,
      [id]
    );
    return res.rows[0] || null;
  }

  async insertHeader(client: PoolClient, data: CreatePoInput & { po_number: string }): Promise<any> {
    const res = await client.query(
      `INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, department_id, order_date, expected_date, notes, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, $8)
       RETURNING *`,
      [
        data.po_number,
        data.supplier_id ?? null,
        data.warehouse_id,
        data.department_id,
        data.order_date ?? null,
        data.expected_date ?? null,
        data.notes ?? null,
        data.created_by,
      ]
    );
    return res.rows[0];
  }

  async updateHeader(
    client: PoolClient,
    id: number,
    fields: Partial<{ supplier_id: number | null; warehouse_id: number; department_id: number | null; expected_date: string | null; order_date: string | null; notes: string | null }>
  ): Promise<any> {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findHeaderById(id);
    const setClauses = keys.map((k, idx) => `${k} = $${idx + 2}`);
    const values = keys.map(k => (fields as any)[k]);
    const res = await client.query(
      `UPDATE purchase_orders SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return res.rows[0];
  }

  async updateStatus(
    client: PoolClient,
    id: number,
    status: PurchaseOrderStatus,
    extra: Partial<{ approved_by: number; approved_at: Date; cancelled_by: number; cancelled_at: Date }> = {}
  ): Promise<any> {
    const setClauses = ['status = $2::purchase_order_status'];
    const values: any[] = [id, status];
    let i = 3;
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined) continue;
      setClauses.push(`${key} = $${i++}`);
      values.push(value);
    }
    const res = await client.query(
      `UPDATE purchase_orders SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    return res.rows[0];
  }

  async softDelete(client: PoolClient, id: number): Promise<void> {
    await client.query('UPDATE purchase_orders SET is_active = false WHERE id = $1', [id]);
  }

  // ── Details ──────────────────────────────────────────────────────────────

  async insertDetails(client: PoolClient, poId: number, lines: PoLineInput[]): Promise<void> {
    for (const line of lines) {
      await client.query(
        `INSERT INTO purchase_order_details (po_id, item_id, quantity_ordered, unit_code, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [poId, line.item_id, line.quantity_ordered, line.unit_code, line.unit_price ?? 0, line.notes ?? null]
      );
    }
  }

  async deleteDetails(client: PoolClient, poId: number): Promise<void> {
    await client.query('DELETE FROM purchase_order_details WHERE po_id = $1', [poId]);
  }

  async findDetailsByPoId(poId: number, client?: PoolClient): Promise<any[]> {
    const q = client ?? pool;
    const res = await q.query('SELECT * FROM purchase_order_details WHERE po_id = $1 ORDER BY id', [poId]);
    return res.rows;
  }

  async findDetailByIdForUpdate(client: PoolClient, detailId: number): Promise<any | null> {
    const res = await client.query('SELECT * FROM purchase_order_details WHERE id = $1 FOR UPDATE', [detailId]);
    return res.rows[0] || null;
  }

  async incrementDetailAllocated(client: PoolClient, detailId: number, qty: number): Promise<void> {
    // The CHECK constraint ck_pod_allocated_le_received is the final guard:
    // if it is violated the whole transaction rolls back.
    await client.query(
      'UPDATE purchase_order_details SET quantity_allocated = quantity_allocated + $2 WHERE id = $1',
      [detailId, qty]
    );
  }

  async incrementDetailTransferred(client: PoolClient, detailId: number, qty: number): Promise<void> {
    await client.query(
      'UPDATE purchase_order_details SET quantity_transferred = quantity_transferred + $2 WHERE id = $1',
      [detailId, qty]
    );
  }

  // ── Allocations ──────────────────────────────────────────────────────────

  async insertAllocation(
    client: PoolClient,
    data: {
      po_detail_id: number;
      po_id: number;
      source_warehouse_id: number;
      dest_warehouse_id: number;
      quantity_allocated: number;
      receive_transaction_id?: number | null;
      allocated_by: number;
    }
  ): Promise<any> {
    const res = await client.query(
      `INSERT INTO purchase_order_allocations
         (po_detail_id, po_id, source_warehouse_id, dest_warehouse_id, quantity_allocated, status, receive_transaction_id, allocated_by, allocated_at)
       VALUES ($1, $2, $3, $4, $5, 'allocated', $6, $7, NOW())
       RETURNING *`,
      [
        data.po_detail_id,
        data.po_id,
        data.source_warehouse_id,
        data.dest_warehouse_id,
        data.quantity_allocated,
        data.receive_transaction_id ?? null,
        data.allocated_by,
      ]
    );
    return res.rows[0];
  }

  async findAllocationById(id: number): Promise<any | null> {
    const res = await pool.query(
      `SELECT poa.*, po.warehouse_id AS po_warehouse_id, po.po_number, po.status AS po_status,
              po.department_id AS po_department_id
       FROM purchase_order_allocations poa JOIN purchase_orders po ON po.id = poa.po_id
       WHERE poa.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findAllocationByIdForUpdate(client: PoolClient, id: number): Promise<any | null> {
    const res = await client.query(
      `SELECT poa.*, po.warehouse_id AS po_warehouse_id, po.po_number, po.status AS po_status,
              po.department_id AS po_department_id
       FROM purchase_order_allocations poa JOIN purchase_orders po ON po.id = poa.po_id
       WHERE poa.id = $1 FOR UPDATE OF poa`,
      [id]
    );
    return res.rows[0] || null;
  }

  /**
   * OPEN reservation per (item, source warehouse) across ALL purchase orders —
   * the overlay subtracted from physical stock to obtain availability.
   */
  static readonly OPEN_ALLOCATION_SQL = `
    SELECT pod.item_id, poa.source_warehouse_id,
           SUM(poa.quantity_allocated - poa.quantity_transferred) AS open_qty
    FROM purchase_order_allocations poa
    JOIN purchase_order_details pod ON pod.id = poa.po_detail_id
    WHERE poa.status IN ('allocated', 'partially_transferred')
    GROUP BY pod.item_id, poa.source_warehouse_id
  `;
}

export const purchaseOrdersRepository = new PurchaseOrdersRepository();
