import { pool } from '../../config/database';
import { Pool, PoolClient } from 'pg';
import type { AuthUserContext } from '../authorization/authorization.service';
import { PERMISSIONS } from '../authorization/permissions';
import type { PurchaseRequestStatus } from './purchase-requests.types';

type Queryable = Pool | PoolClient;

/**
 * WHERE scope for purchase requests.
 *
 * The permission model drives the scope (never the raw role): a caller can
 * reach this repository only after the route guard passed (`view` OR
 * `view_own`). The view scope is then narrowed by data:
 *   - `view`        -> admin: all requests; department_manager: own department.
 *   - `view_own`    -> sub_warehouse_manager: requests they created.
 *   - everything else (should not happen after the guard) -> FALSE (fail closed).
 */
export function prScopeClause(user: AuthUserContext, startIndex = 1): { clause: string; params: any[] } {
  const perms = user.permissions;
  const hasView = perms.includes(PERMISSIONS.PURCHASE_REQUESTS_VIEW);
  const hasViewOwn = perms.includes(PERMISSIONS.PURCHASE_REQUESTS_VIEW_OWN);
  let n = startIndex;

  if (hasView) {
    if (user.role === 'admin') return { clause: 'TRUE', params: [] };
    if (user.department_id != null) {
      return { clause: `pr.department_id = $${n}`, params: [user.department_id] };
    }
  }
  if (hasViewOwn) {
    return { clause: `pr.created_by = $${n}`, params: [user.id] };
  }
  return { clause: 'FALSE', params: [] };
}

const PR_SELECT = `
  SELECT pr.id, pr.request_no, pr.department_id, pr.warehouse_id, pr.created_by,
         pr.status, pr.notes,
         pr.dept_approved_by, pr.dept_approved_at,
         pr.admin_approved_by, pr.admin_approved_at,
         pr.rejected_by, pr.rejection_reason, pr.rejected_at,
         pr.cancelled_by, pr.cancelled_at,
         pr.purchase_order_id, pr.created_at, pr.updated_at,
         w.code AS warehouse_code, w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
         w.is_main AS warehouse_is_main,
         d.code AS department_code, d.name_ar AS department_name_ar, d.name_en AS department_name_en,
         cu.username AS created_by_username, cu.full_name AS created_by_name,
         du.full_name AS dept_approved_by_name,
         au.full_name AS admin_approved_by_name,
         ru.full_name AS rejected_by_name,
         xu.full_name AS cancelled_by_name,
         po.po_number AS po_number,
         COALESCE(item_agg.items_count, 0)::int AS items_count,
         COALESCE(item_agg.quantity_total, 0) AS quantity_total
  FROM purchase_requests pr
  JOIN warehouses w ON w.id = pr.warehouse_id
  JOIN departments d ON d.id = pr.department_id
  JOIN users cu ON cu.id = pr.created_by
  LEFT JOIN users du ON du.id = pr.dept_approved_by
  LEFT JOIN users au ON au.id = pr.admin_approved_by
  LEFT JOIN users ru ON ru.id = pr.rejected_by
  LEFT JOIN users xu ON xu.id = pr.cancelled_by
  LEFT JOIN purchase_orders po ON po.id = pr.purchase_order_id
  LEFT JOIN (
    SELECT purchase_request_id,
           COUNT(*)::int AS items_count,
           SUM(quantity)  AS quantity_total
    FROM purchase_request_items
    GROUP BY purchase_request_id
  ) item_agg ON item_agg.purchase_request_id = pr.id
`;

export interface PrItemInput {
  item_id: number;
  quantity: number;
  unit_code: string;
  notes?: string | null;
}

export interface CreatePrInput {
  request_no: string;
  department_id: number;
  warehouse_id: number;
  created_by: number;
  notes?: string | null;
}

export class PurchaseRequestsRepository {
  async generateRequestNo(client: PoolClient): Promise<string> {
    const res = await client.query("SELECT nextval('pr_no_seq') AS seq");
    const year = new Date().getFullYear();
    return `PR-${year}-${String(res.rows[0].seq).padStart(6, '0')}`;
  }

  async create(client: PoolClient, data: CreatePrInput): Promise<any> {
    const res = await client.query(
      `INSERT INTO purchase_requests (request_no, department_id, warehouse_id, created_by, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.request_no, data.department_id, data.warehouse_id, data.created_by, data.notes ?? null]
    );
    return res.rows[0];
  }

  async insertItems(client: PoolClient, requestId: number, items: PrItemInput[]): Promise<void> {
    for (const item of items) {
      await client.query(
        `INSERT INTO purchase_request_items (purchase_request_id, item_id, quantity, unit_code, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [requestId, item.item_id, item.quantity, item.unit_code, item.notes ?? null]
      );
    }
  }

  async findItems(client: Queryable, requestId: number): Promise<any[]> {
    const res = await client.query(
      `SELECT pri.*, i.item_code, i.name_ar AS item_name_ar
         FROM purchase_request_items pri
         JOIN items i ON i.id = pri.item_id
        WHERE pri.purchase_request_id = $1
        ORDER BY pri.id`,
      [requestId]
    );
    return res.rows;
  }

  async findById(id: number, client?: Queryable): Promise<any | null> {
    const q = client ?? pool;
    const res = await q.query(`${PR_SELECT} WHERE pr.id = $1`, [id]);
    return res.rows[0] || null;
  }

  /** Locks a single request row FOR UPDATE (used inside the auto-PO transaction). */
  async findHeaderByIdForUpdate(client: PoolClient, id: number): Promise<any | null> {
    const res = await client.query(
      `SELECT pr.*, w.is_main AS warehouse_is_main
         FROM purchase_requests pr
         JOIN warehouses w ON w.id = pr.warehouse_id
        WHERE pr.id = $1
        FOR UPDATE OF pr`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findAll(
    page: number,
    limit: number,
    filters: { status?: string },
    user: AuthUserContext
  ): Promise<{ items: any[]; total: number }> {
    const scope = prScopeClause(user, 1);
    const where: string[] = [scope.clause];
    const params: any[] = [...scope.params];
    let i = params.length + 1;

    if (filters.status) {
      where.push(`pr.status = $${i++}`);
      params.push(filters.status);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const offset = (page - 1) * limit;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM purchase_requests pr ${whereSql}`,
      params
    );
    const total = countRes.rows[0].total;

    const res = await pool.query(
      `${PR_SELECT} ${whereSql} ORDER BY pr.created_at DESC, pr.id DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );

    return { items: res.rows, total };
  }

  async updateStatus(
    client: PoolClient,
    id: number,
    status: PurchaseRequestStatus,
    extra: Partial<{
      dept_approved_by: number;
      dept_approved_at: Date;
      admin_approved_by: number;
      admin_approved_at: Date;
      rejected_by: number;
      rejection_reason: string | null;
      rejected_at: Date;
      cancelled_by: number;
      cancelled_at: Date;
    }> = {}
  ): Promise<any> {
    const setClauses = ['status = $2::purchase_request_status'];
    const values: any[] = [id, status];
    let i = 3;
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined) continue;
      setClauses.push(`${key} = $${i++}`);
      values.push(value);
    }
    const res = await client.query(
      `UPDATE purchase_requests SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    return res.rows[0];
  }

  async linkPurchaseOrder(client: PoolClient, id: number, poId: number): Promise<void> {
    await client.query(
      'UPDATE purchase_requests SET purchase_order_id = $2 WHERE id = $1',
      [id, poId]
    );
  }
}

export const purchaseRequestsRepository = new PurchaseRequestsRepository();