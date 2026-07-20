import { PoolClient } from 'pg';
import { pool } from '../../config/database';

export interface ItemsFilter {
  category_code?: string;
  warehouse_id?: number;
  search?: string;
  is_active?: boolean;
}

export class ItemsRepository {
  async findAll(limit?: number, offset?: number, filter?: ItemsFilter) {
    let query = `SELECT i.id, i.item_code, i.name_ar, i.name_en, i.description,
      i.category_code, i.unit_code, i.warehouse_id,
      i.min_stock_level, i.max_stock_level, i.current_balance, i.location, i.is_active,
      c.name_ar AS category_name_ar, c.name_en AS category_name_en,
      u.name_ar AS unit_name_ar, u.name_en AS unit_name_en,
      w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en
    FROM items i
    LEFT JOIN categories c ON c.code = i.category_code
    LEFT JOIN units u ON u.code = i.unit_code
    LEFT JOIN warehouses w ON w.id = i.warehouse_id
    WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filter?.category_code) {
      query += ` AND i.category_code = $${paramIndex++}`;
      params.push(filter.category_code);
    }
    if (filter?.warehouse_id) {
      query += ` AND i.warehouse_id = $${paramIndex++}`;
      params.push(filter.warehouse_id);
    }
    if (filter?.is_active !== undefined) {
      query += ` AND i.is_active = $${paramIndex++}`;
      params.push(filter.is_active);
    } else {
      query += ' AND i.is_active = true';
    }
    if (filter?.search) {
      query += ` AND (i.item_code ILIKE $${paramIndex} OR i.name_ar ILIKE $${paramIndex})`;
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    query += ' ORDER BY i.id';
    if (limit !== undefined && offset !== undefined) {
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);
    }
    const res = await pool.query(query, params);
    return res.rows;
  }

  async countAll(filter?: ItemsFilter) {
    let query = 'SELECT COUNT(*)::int AS total FROM items WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filter?.category_code) {
      query += ` AND category_code = $${paramIndex++}`;
      params.push(filter.category_code);
    }
    if (filter?.warehouse_id) {
      query += ` AND warehouse_id = $${paramIndex++}`;
      params.push(filter.warehouse_id);
    }
    if (filter?.is_active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(filter.is_active);
    } else {
      query += ' AND is_active = true';
    }
    if (filter?.search) {
      query += ` AND (item_code ILIKE $${paramIndex} OR name_ar ILIKE $${paramIndex})`;
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    const res = await pool.query(query, params);
    return res.rows[0].total;
  }

  async findByIdForUpdate(client: PoolClient, id: number) {
    const res = await client.query('SELECT id, item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, location, is_active FROM items WHERE id = $1 FOR UPDATE', [id]);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async updateBalance(client: PoolClient, id: number, newBalance: number) {
    await client.query('UPDATE items SET current_balance = $1 WHERE id = $2', [newBalance, id]);
  }

  async createItem(data: {
    item_code: string;
    name_ar: string;
    name_en?: string;
    description?: string;
    category_code: string;
    unit_code: string;
    warehouse_id: number;
    min_stock_level?: number;
    max_stock_level?: number;
    current_balance?: number;
    location?: string;
  }) {
    const res = await pool.query(
      `INSERT INTO items (item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.item_code,
        data.name_ar,
        data.name_en ?? null,
        data.description ?? null,
        data.category_code,
        data.unit_code,
        data.warehouse_id,
        data.min_stock_level ?? 0,
        data.max_stock_level ?? 999999.9999,
        data.current_balance ?? 0,
        data.location ?? null,
      ]
    );
    return res.rows[0];
  }

  async getItemById(id: number) {
    const res = await pool.query('SELECT id, item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, location, is_active FROM items WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async updateItem(
    id: number,
    data: Partial<{
      item_code: string;
      name_ar: string;
      description: string;
      category_code: string;
      unit_code: string;
      warehouse_id: number;
      min_stock_level: number;
      max_stock_level: number;
      current_balance: number;
      location: string;
      is_active: boolean;
    }>
  ) {
    const keys = Object.keys(data);
    if (keys.length === 0) return (await this.getItemById(id));

    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`);
    const values = keys.map((k) => (data as any)[k]);

    const res = await pool.query(
      `UPDATE items SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async deleteItem(id: number) {
    const res = await pool.query(
      `UPDATE items SET is_active = false WHERE id = $1 RETURNING *`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async findByItemCode(item_code: string) {
    const res = await pool.query('SELECT id, item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, location, is_active FROM items WHERE item_code = $1', [item_code]);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async getItemsByCategory(category_code: string) {
    const res = await pool.query('SELECT id, item_code, name_ar, name_en, description, category_code, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, location, is_active FROM items WHERE category_code = $1', [category_code]);
    return res.rows;
  }
}
export const itemsRepository = new ItemsRepository();
