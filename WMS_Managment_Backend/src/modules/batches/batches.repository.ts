import { pool } from '../../config/database';
import { PoolClient } from 'pg';
import { warehouseAccessClause } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export interface BatchRow {
  id: number;
  item_id: number;
  warehouse_id: number;
  batch_number: string;
  production_date?: Date | null;
  expiry_date?: Date | null;
  quantity: number;
  unit_code: string;
  supplier_id?: number | null;
  transaction_id?: number | null;
  notes?: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class BatchesRepository {
  
  async create(client: PoolClient, batch: Omit<BatchRow, 'id' | 'created_at' | 'updated_at' | 'is_active'>) {
    const res = await client.query(
      `INSERT INTO batches (item_id, warehouse_id, batch_number, production_date, expiry_date, quantity, unit_code, supplier_id, transaction_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (item_id, warehouse_id, batch_number) DO UPDATE
       SET quantity = batches.quantity + EXCLUDED.quantity, updated_at = NOW()
       RETURNING *`,
      [
        batch.item_id, batch.warehouse_id, batch.batch_number,
        batch.production_date ?? null, batch.expiry_date ?? null,
        batch.quantity, batch.unit_code, batch.supplier_id ?? null,
        batch.transaction_id ?? null, batch.notes ?? null
      ]
    );
    return res.rows[0];
  }

  async deductQuantity(client: PoolClient, itemId: number, warehouseId: number, batchNumber: string, deductQty: number) {
    const res = await client.query(
      `UPDATE batches SET quantity = quantity - $4, updated_at = NOW()
       WHERE item_id = $1 AND warehouse_id = $2 AND batch_number = $3 AND quantity >= $4
       RETURNING *`,
      [itemId, warehouseId, batchNumber, deductQty]
    );
    return res.rows[0] || null;
  }

  async findAll(filters: { item_id?: number; warehouse_id?: number; expiring_in_days?: number; search?: string; limit?: number; offset?: number; user?: AuthUserContext }) {
    let where = 'WHERE b.is_active = true AND b.quantity > 0';
    const params: any[] = [];
    let i = 1;

    if (filters.item_id) { where += ` AND b.item_id = $${i++}`; params.push(filters.item_id); }
    if (filters.warehouse_id) { where += ` AND b.warehouse_id = $${i++}`; params.push(filters.warehouse_id); }
    
    if (filters.expiring_in_days !== undefined) {
      where += ` AND b.expiry_date IS NOT NULL AND b.expiry_date <= NOW() + ($${i++} || ' days')::interval`;
      params.push(filters.expiring_in_days);
    }
    
    if (filters.search) {
      where += ` AND (b.batch_number ILIKE $${i} OR i.name_ar ILIKE $${i})`;
      params.push(`%${filters.search}%`);
      i++;
    }

    // Data-scope enforcement: warehouse_manager sees batches of their assigned
    // warehouses, department_manager sees batches of their department's
    // warehouses (plus explicitly assigned ones), system_admin sees everything.
    if (filters.user) {
      const scope = warehouseAccessClause(filters.user, 'b.warehouse_id', i);
      if (scope.clause !== 'TRUE') {
        where += ` AND ${scope.clause}`;
        params.push(...scope.params);
        i += scope.params.length;
      }
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [listRes, countRes] = await Promise.all([
      pool.query(
        `SELECT b.*,
                i.item_code, i.name_ar AS item_name_ar,
                w.name_ar AS warehouse_name_ar,
                u.name_ar AS unit_name_ar,
                s.name_ar AS supplier_name_ar
         FROM batches b
         JOIN items i ON i.id = b.item_id
         JOIN warehouses w ON w.id = b.warehouse_id
         JOIN units u ON u.code = b.unit_code
         LEFT JOIN suppliers s ON s.id = b.supplier_id
         ${where}
         ORDER BY b.expiry_date ASC NULLS LAST, b.created_at ASC
         LIMIT $${i++} OFFSET $${i++}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM batches b JOIN items i ON i.id = b.item_id ${where}`, params)
    ]);

    return { items: listRes.rows, total: countRes.rows[0].total };
  }
}

export const batchesRepository = new BatchesRepository();
