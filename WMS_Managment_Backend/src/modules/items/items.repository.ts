import { PoolClient } from 'pg';
import { pool } from '../../config/database';
import { warehouseAccessClause, isWarehouseFallbackUser } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';
import { OPEN_ALLOCATIONS_CTE } from '../purchase-orders/stock-availability';

export interface ItemsFilter {
  category_code?: string;
  subcategory_id?: number;
  warehouse_id?: number;
  search?: string;
  is_active?: boolean;
  /** Current authenticated user — used to restrict visible items to their
   *  accessible warehouses (warehouse_manager -> assigned, department_manager
   *  -> department-owned warehouses). */
  user?: AuthUserContext;
}

export class ItemsRepository {
  async findAll(limit?: number, offset?: number, filter?: ItemsFilter) {
    let query = `SELECT i.id, i.item_code, i.name_ar, i.name_en, i.description,
      i.category_code, i.subcategory_id, i.unit_code, i.warehouse_id,
      i.min_stock_level, i.max_stock_level, i.current_balance, i.location, i.is_active,
      i.is_consumable, i.expiry_alert_days, i.sap_material_number, i.gl_account,
      i.last_purchase_price, i.opening_price,
      c.name_ar AS category_name_ar, c.name_en AS category_name_en,
      sc.name_ar AS subcategory_name_ar, sc.name_en AS subcategory_name_en,
      u.name_ar AS unit_name_ar, u.name_en AS unit_name_en,
      w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en
    FROM items i
    LEFT JOIN categories c ON c.code = i.category_code
    LEFT JOIN subcategories sc ON sc.id = i.subcategory_id
    LEFT JOIN units u ON u.code = i.unit_code
    LEFT JOIN warehouses w ON w.id = i.warehouse_id
    WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filter?.category_code) {
      query += ` AND i.category_code = $${paramIndex++}`;
      params.push(filter.category_code);
    }
    if (filter?.subcategory_id) {
      query += ` AND i.subcategory_id = $${paramIndex++}`;
      params.push(filter.subcategory_id);
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
      query += ` AND (i.item_code ILIKE $${paramIndex} OR i.name_ar ILIKE $${paramIndex} OR i.name_en ILIKE $${paramIndex})`;
      params.push(`%${filter.search}%`);
      paramIndex++;
    }
    if (filter?.user) {
      if (!isWarehouseFallbackUser(filter.user)) {
        const scope = warehouseAccessClause(filter.user, 'i.warehouse_id', paramIndex);
        if (scope.clause !== 'TRUE') {
          query += ` AND ${scope.clause}`;
          params.push(...scope.params);
          paramIndex += scope.params.length;
        }
      }
      // Zero-assignment warehouse_manager: no scope clause -> the full active
      // item catalog is exposed so the create-request fallback can be used.
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
    if (filter?.subcategory_id) {
      query += ` AND subcategory_id = $${paramIndex++}`;
      params.push(filter.subcategory_id);
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
    if (filter?.user) {
      if (!isWarehouseFallbackUser(filter.user)) {
        const scope = warehouseAccessClause(filter.user, 'warehouse_id', paramIndex);
        if (scope.clause !== 'TRUE') {
          query += ` AND ${scope.clause}`;
          params.push(...scope.params);
          paramIndex += scope.params.length;
        }
      }
    }

    const res = await pool.query(query, params);
    return res.rows[0].total;
  }

  async findByIdForUpdate(client: PoolClient, id: number) {
    const res = await client.query(
      `SELECT i.id, i.item_code, i.name_ar, i.name_en, i.description,
              i.category_code, i.unit_code, i.warehouse_id,
              i.current_balance, i.last_purchase_price, i.location, i.is_active,
              COALESCE(iws.current_balance, i.current_balance) AS warehouse_balance,
              iws.min_stock_level, iws.max_stock_level
       FROM items i
       LEFT JOIN item_warehouse_stock iws ON iws.item_id = i.id AND iws.warehouse_id = i.warehouse_id
       WHERE i.id = $1 FOR UPDATE OF i`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async updateLastPurchasePrice(client: PoolClient, id: number, price: number) {
    await client.query('UPDATE items SET last_purchase_price = $1 WHERE id = $2', [price, id]);
  }

  /** Update balance in both items (legacy) and item_warehouse_stock (new source of truth) */
  async updateBalance(client: PoolClient, id: number, newBalance: number, warehouseId?: number) {
    await client.query('UPDATE items SET current_balance = $1 WHERE id = $2', [newBalance, id]);
    if (warehouseId) {
      await client.query(
        `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (item_id, warehouse_id)
         DO UPDATE SET current_balance = EXCLUDED.current_balance`,
        [id, warehouseId, newBalance]
      );
    }
  }

  /**
   * Upserts a per-warehouse stock balance WITHOUT touching the legacy
   * items.current_balance column. Used by multi-warehouse transfers where the
   * legacy column must keep reflecting the item's PRIMARY warehouse balance.
   */
  async upsertWarehouseStock(client: PoolClient, itemId: number, warehouseId: number, newBalance: number) {
    await client.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (item_id, warehouse_id)
       DO UPDATE SET current_balance = EXCLUDED.current_balance`,
      [itemId, warehouseId, newBalance]
    );
  }

  /** Sets the legacy items.current_balance (the primary warehouse balance). */
  async setPrimaryBalance(client: PoolClient, itemId: number, balance: number) {
    await client.query('UPDATE items SET current_balance = $1 WHERE id = $2', [balance, itemId]);
  }

  /** Get stock balance for a specific item in a specific warehouse */
  async getWarehouseStock(client: PoolClient | null, itemId: number, warehouseId: number) {
    const q = client ?? pool;
    const res = await (q as any).query(
      'SELECT * FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2 FOR UPDATE',
      [itemId, warehouseId]
    );
    return res.rows[0] || null;
  }

  /** Get stock balances across the warehouses the current user may access. */
  async getStockByWarehouse(itemId: number, user?: AuthUserContext) {
    let query = `WITH ${OPEN_ALLOCATIONS_CTE}
      SELECT iws.*, w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
             iws.current_balance AS physical_stock,
             COALESCE(oa.allocated_qty, 0) AS allocated_stock,
             GREATEST(COALESCE(iws.current_balance, 0) - COALESCE(oa.allocated_qty, 0), 0) AS available_stock
       FROM item_warehouse_stock iws
       LEFT JOIN open_allocations oa ON oa.item_id = iws.item_id AND oa.source_warehouse_id = iws.warehouse_id
       JOIN warehouses w ON w.id = iws.warehouse_id
       WHERE iws.item_id = $1`;
    const params: any[] = [itemId];
    let paramIndex = 2;
    if (user) {
      const scope = warehouseAccessClause(user, 'iws.warehouse_id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
        paramIndex += scope.params.length;
      }
    }
    query += ' ORDER BY w.code';
    const res = await pool.query(query, params);
    return res.rows;
  }

  /** Initialize stock record for new item in its primary warehouse */
  async initWarehouseStock(
    client: PoolClient,
    itemId: number,
    warehouseId: number,
    initialBalance: number,
    minLevel: number,
    maxLevel: number
  ) {
    await client.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance, min_stock_level, max_stock_level)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (item_id, warehouse_id) DO NOTHING`,
      [itemId, warehouseId, initialBalance, minLevel, maxLevel]
    );
  }

  async createItem(data: {
    item_code: string;
    name_ar: string;
    name_en?: string;
    description?: string;
    category_code: string;
    subcategory_id?: number | null;
    unit_code: string;
    warehouse_id: number;
    min_stock_level?: number;
    max_stock_level?: number;
    current_balance?: number;
    last_purchase_price?: number;
    opening_price?: number;
    location?: string;
    is_consumable?: boolean;
    expiry_alert_days?: number;
    sap_material_number?: string | null;
    gl_account?: string | null;
  }) {
    const res = await pool.query(
      `INSERT INTO items (item_code, name_ar, name_en, description, category_code, subcategory_id, unit_code, warehouse_id, min_stock_level, max_stock_level, current_balance, last_purchase_price, opening_price, location, is_consumable, expiry_alert_days, sap_material_number, gl_account)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        data.item_code,
        data.name_ar,
        data.name_en ?? null,
        data.description ?? null,
        data.category_code,
        data.subcategory_id ?? null,
        data.unit_code,
        data.warehouse_id,
        data.min_stock_level ?? 0,
        data.max_stock_level ?? 999999.9999,
        data.current_balance ?? 0,
        data.last_purchase_price ?? 0,
        data.opening_price ?? 0,
        data.location ?? null,
        data.is_consumable ?? true,
        data.expiry_alert_days ?? 30,
        data.sap_material_number ?? null,
        data.gl_account ?? null,
      ]
    );
    return res.rows[0];
  }

  async getItemById(id: number) {
    const res = await pool.query(
      `SELECT i.id, i.item_code, i.name_ar, i.name_en, i.description, i.category_code, i.subcategory_id, i.unit_code, i.warehouse_id, i.min_stock_level, i.max_stock_level, i.current_balance, i.last_purchase_price, i.opening_price, i.location, i.is_active, i.is_consumable, i.expiry_alert_days, i.sap_material_number, i.gl_account,
              c.name_ar AS category_name_ar, c.name_en AS category_name_en,
              sc.name_ar AS subcategory_name_ar, sc.name_en AS subcategory_name_en,
              u.name_ar AS unit_name_ar, u.name_en AS unit_name_en,
              w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en
       FROM items i
       LEFT JOIN categories c ON c.code = i.category_code
       LEFT JOIN subcategories sc ON sc.id = i.subcategory_id
       LEFT JOIN units u ON u.code = i.unit_code
       LEFT JOIN warehouses w ON w.id = i.warehouse_id
       WHERE i.id = $1`, [id]
    );
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
      subcategory_id: number | null;
      unit_code: string;
      warehouse_id: number;
      min_stock_level: number;
      max_stock_level: number;
      current_balance: number;
      location: string;
      is_active: boolean;
      is_consumable: boolean;
      expiry_alert_days: number;
      sap_material_number: string | null;
      gl_account: string | null;
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
    const res = await pool.query(
      `SELECT i.id, i.item_code, i.name_ar, i.name_en, i.description, i.category_code, i.subcategory_id, i.unit_code, i.warehouse_id, i.min_stock_level, i.max_stock_level, i.current_balance, i.last_purchase_price, i.opening_price, i.location, i.is_active, i.is_consumable, i.expiry_alert_days, i.sap_material_number, i.gl_account
       FROM items i WHERE i.item_code = $1`, [item_code]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async getItemsByCategory(category_code: string) {
    const res = await pool.query(
      `SELECT i.id, i.item_code, i.name_ar, i.name_en, i.description, i.category_code, i.subcategory_id, i.unit_code, i.warehouse_id, i.min_stock_level, i.max_stock_level, i.current_balance, i.location, i.is_active, i.is_consumable, i.expiry_alert_days, i.sap_material_number, i.gl_account
       FROM items i WHERE i.category_code = $1`, [category_code]
    );
    return res.rows;
  }
}
export const itemsRepository = new ItemsRepository();
