import { pool } from '../../config/database';
import { PoolClient } from 'pg';
import { scopeForUser, type DataScope } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export type CustodyStatus = 'active' | 'returned' | 'damaged' | 'lost' | 'return_pending';
export type CustodyCondition = 'good' | 'damaged' | 'lost';

export function custodyScopeClause(user: AuthUserContext, startIndex = 1): { clause: string; params: any[] } {
  const scope: DataScope = scopeForUser(user);
  let n = startIndex;
  if (scope === 'GLOBAL') return { clause: 'TRUE', params: [] };
  if (scope === 'WAREHOUSE') {
    if (user.warehouse_ids.length === 0) return { clause: 'FALSE', params: [] };
    return { clause: `c.warehouse_id = ANY($${n})`, params: [user.warehouse_ids] };
  }
  if (scope === 'DEPARTMENT' && user.department_id != null) {
    return {
      clause: `(EXISTS (SELECT 1 FROM projects p WHERE p.id = c.project_id AND p.department_id = $${n})
                OR c.assigned_to IN (SELECT id FROM users u WHERE u.department_id = $${n}))`,
      params: [user.department_id],
    };
  }
  // NONE scope (supervisor, department_manager): show only custodies
  // assigned to the current user.
  if (user.id) {
    return { clause: `c.assigned_to = $${n}`, params: [user.id] };
  }
  return { clause: 'FALSE', params: [] };
}

export interface Custody {
  id: number;
  item_id: number;
  warehouse_id: number;
  assigned_to: number;
  quantity: number;
  unit_code: string;
  issued_transaction_id: number;
  return_transaction_id?: number | null;
  request_id?: number | null;
  project_id?: number | null;
  status: CustodyStatus;
  condition?: CustodyCondition | null;
  expected_return_at?: string | Date | null;
  notes?: string | null;
  returned_at?: Date | null;
  pending_return_quantity?: number | null;
  return_notes?: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CustodyFilters {
  status?: CustodyStatus;
  assigned_to?: number;
  project_id?: number;
  warehouse_id?: number;
  limit?: number;
  offset?: number;
  /** Current authenticated user — used to build the authorization scope clause. */
  user?: AuthUserContext;
}

export class CustodiesRepository {
  /** Create a custody record (used when issuing a non-consumable item) */
  async create(
    client: PoolClient,
    data: {
      item_id: number;
      warehouse_id: number;
      assigned_to: number;
      quantity: number;
      unit_code: string;
      issued_transaction_id: number;
      request_id?: number | null;
      project_id?: number | null;
      expected_return_at?: string | Date | null;
      notes?: string | null;
    }
  ): Promise<Custody> {
    const res = await client.query(
      `INSERT INTO custodies
         (item_id, warehouse_id, assigned_to, quantity, unit_code, issued_transaction_id, request_id, project_id, expected_return_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.item_id,
        data.warehouse_id,
        data.assigned_to,
        data.quantity,
        data.unit_code,
        data.issued_transaction_id,
        data.request_id ?? null,
        data.project_id ?? null,
        data.expected_return_at ?? null,
        data.notes ?? null,
      ]
    );
    return res.rows[0];
  }

  async findAll(filters: CustodyFilters) {
    let where = 'WHERE c.is_active = true';
    const params: any[] = [];
    let i = 1;

    if (filters.status)       { where += ` AND c.status = $${i++}`;       params.push(filters.status); }
    if (filters.assigned_to)  { where += ` AND c.assigned_to = $${i++}`;  params.push(filters.assigned_to); }
    if (filters.project_id)   { where += ` AND c.project_id = $${i++}`;   params.push(filters.project_id); }
    if (filters.warehouse_id) { where += ` AND c.warehouse_id = $${i++}`; params.push(filters.warehouse_id); }
    if (filters.user) {
      const scope = custodyScopeClause(filters.user, i);
      where += ` AND (${scope.clause})`;
      params.push(...scope.params);
      i += scope.params.length;
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [listRes, countRes] = await Promise.all([
      pool.query(
        `SELECT c.*,
                i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en,
                u.full_name AS assigned_to_name,
                w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
                p.project_no, p.name AS project_name,
                it.transaction_no AS issued_transaction_no,
                rt.transaction_no AS return_transaction_no
         FROM custodies c
         JOIN items i ON i.id = c.item_id
         JOIN users u ON u.id = c.assigned_to
         JOIN warehouses w ON w.id = c.warehouse_id
         LEFT JOIN projects p ON p.id = c.project_id
         LEFT JOIN transactions it ON it.id = c.issued_transaction_id
         LEFT JOIN transactions rt ON rt.id = c.return_transaction_id
         ${where}
         ORDER BY c.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM custodies c ${where}`, params),
    ]);

    return { items: listRes.rows, total: countRes.rows[0].total };
  }

  async findById(id: number) {
    const res = await pool.query(
      `SELECT c.*,
              i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en,
              u.full_name AS assigned_to_name,
              w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
              p.project_no, p.name AS project_name,
              it.transaction_no AS issued_transaction_no,
              rt.transaction_no AS return_transaction_no
       FROM custodies c
       JOIN items i ON i.id = c.item_id
       JOIN users u ON u.id = c.assigned_to
       JOIN warehouses w ON w.id = c.warehouse_id
       LEFT JOIN projects p ON p.id = c.project_id
       LEFT JOIN transactions it ON it.id = c.issued_transaction_id
       LEFT JOIN transactions rt ON rt.id = c.return_transaction_id
       WHERE c.id = $1 AND c.is_active = true`,
      [id]
    );
    return res.rows[0] || null;
  }

  /** Mark a custody as returned and link the RTI transaction */
  async markReturned(
    client: PoolClient,
    id: number,
    returnTransactionId: number,
    notes?: string | null
  ): Promise<Custody | null> {
    const res = await client.query(
      `UPDATE custodies
       SET status = 'returned',
           condition = 'good',
           return_transaction_id = $2,
           returned_at = NOW(),
           pending_return_quantity = NULL,
           return_notes = NULL,
           notes = COALESCE($3, notes)
       WHERE id = $1 AND is_active = true AND status IN ('active', 'return_pending')
       RETURNING *`,
      [id, returnTransactionId, notes ?? null]
    );
    return res.rows[0] || null;
  }

  /**
   * Reduce a custody's outstanding quantity after a partial (good) return.
   * The custody stays 'active' with the remaining quantity; the returned part
   * is restored to inventory via the linked RTI transaction.
   */
  async reduceQuantity(
    client: PoolClient,
    id: number,
    returnedQuantity: number,
    returnTransactionId: number,
    notes?: string | null
  ): Promise<Custody | null> {
    const res = await client.query(
      `UPDATE custodies
       SET quantity = quantity - $2,
           status = 'active',
           condition = 'good',
           return_transaction_id = $3,
           pending_return_quantity = NULL,
           return_notes = NULL,
           notes = COALESCE($4, notes)
       WHERE id = $1 AND is_active = true AND status IN ('active', 'return_pending') AND quantity >= $2
       RETURNING *`,
      [id, returnedQuantity, returnTransactionId, notes ?? null]
    );
    return res.rows[0] || null;
  }

  /**
   * Close a custody WITHOUT restoring stock (damaged / lost material). The
   * record is preserved with the given status + condition so the material is
   * never silently restored to the available balance.
   */
  async markUnrestored(
    client: PoolClient,
    id: number,
    status: 'damaged' | 'lost',
    notes?: string | null
  ): Promise<Custody | null> {
    const res = await client.query(
      `UPDATE custodies
       SET status = $2::custody_status,
           condition = $3::custody_condition,
           returned_at = NOW(),
           notes = COALESCE($4, notes)
       WHERE id = $1 AND is_active = true AND status IN ('active', 'return_pending')
       RETURNING *`,
      [id, status, status, notes ?? null]
    );
    return res.rows[0] || null;
  }

  /** Count active and return-pending custody records belonging to a project */
  async countActiveCustodiesByProject(projectId: number): Promise<number> {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM custodies
       WHERE project_id = $1 AND status IN ('active', 'return_pending') AND is_active = true`,
      [projectId]
    );
    return res.rows[0].total;
  }
}

export const custodiesRepository = new CustodiesRepository();
