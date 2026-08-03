import { pool } from '../../config/database';
import { PoolClient } from 'pg';

export type CustodyStatus = 'active' | 'returned';

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
  notes?: string | null;
  returned_at?: Date | null;
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
      notes?: string | null;
    }
  ): Promise<Custody> {
    const res = await client.query(
      `INSERT INTO custodies
         (item_id, warehouse_id, assigned_to, quantity, unit_code, issued_transaction_id, request_id, project_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
           return_transaction_id = $2,
           returned_at = NOW(),
           notes = COALESCE($3, notes)
       WHERE id = $1 AND is_active = true AND status = 'active'
       RETURNING *`,
      [id, returnTransactionId, notes ?? null]
    );
    return res.rows[0] || null;
  }

  /** Count active custody records belonging to a project */
  async countActiveCustodiesByProject(projectId: number): Promise<number> {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM custodies
       WHERE project_id = $1 AND status = 'active' AND is_active = true`,
      [projectId]
    );
    return res.rows[0].total;
  }
}

export const custodiesRepository = new CustodiesRepository();
