import { PaginationMeta } from '../../utils/response';
import { pool } from '../../config/database';

export interface InventoryReportFilters {
  warehouse_id?: number;
  category_code?: string;
  is_active?: boolean;
  low_stock?: boolean;
  overstock?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export class InventoryReportService {
  async getInventoryReport(filters: InventoryReportFilters) {
    let query = `
      SELECT
        i.id, i.item_code, i.name_ar, i.description,
        i.warehouse_id, i.category_code,
        COALESCE(iws.current_balance, i.current_balance) AS current_balance, 
        iws.min_stock_level, iws.max_stock_level,
        i.location, i.is_active,
        c.name_ar AS category_name,
        u.name_ar AS unit_name,
        w.name_ar AS warehouse_name, w.code AS warehouse_code
      FROM items i
      LEFT JOIN item_warehouse_stock iws ON iws.item_id = i.id AND (iws.warehouse_id = i.warehouse_id)
      LEFT JOIN categories c ON c.code = i.category_code
      LEFT JOIN units u ON u.code = i.unit_code
      LEFT JOIN warehouses w ON w.id = i.warehouse_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (filters.warehouse_id) {
      query += ` AND i.warehouse_id = $${paramIndex++}`;
      params.push(filters.warehouse_id);
    }

    if (filters.category_code) {
      query += ` AND i.category_code = $${paramIndex++}`;
      params.push(filters.category_code);
    }

    if (filters.is_active !== undefined) {
      query += ` AND i.is_active = $${paramIndex++}`;
      params.push(filters.is_active);
    }

    if (filters.low_stock) {
      query += ` AND COALESCE(iws.current_balance, i.current_balance) <= iws.min_stock_level`;
    }

    if (filters.overstock) {
      query += ` AND COALESCE(iws.current_balance, i.current_balance) >= iws.max_stock_level`;
    }

    if (filters.search) {
      query += ` AND (i.item_code ILIKE $${paramIndex} OR i.name_ar ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY w.code, i.item_code`;

    if (filters.limit !== undefined && filters.page !== undefined) {
      const offset = (filters.page - 1) * filters.limit;
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(filters.limit, offset);
    }

    let countQuery = `SELECT COUNT(*)::int AS total FROM items i LEFT JOIN item_warehouse_stock iws ON iws.item_id = i.id AND (iws.warehouse_id = i.warehouse_id) LEFT JOIN categories c ON c.code = i.category_code LEFT JOIN units u ON u.code = i.unit_code LEFT JOIN warehouses w ON w.id = i.warehouse_id WHERE 1=1`;
    const countParams: any[] = [];
    let countIdx = 1;

    if (filters.warehouse_id) {
      countQuery += ` AND i.warehouse_id = $${countIdx++}`;
      countParams.push(filters.warehouse_id);
    }
    if (filters.category_code) {
      countQuery += ` AND i.category_code = $${countIdx++}`;
      countParams.push(filters.category_code);
    }
    if (filters.is_active !== undefined) {
      countQuery += ` AND i.is_active = $${countIdx++}`;
      countParams.push(filters.is_active);
    }
    if (filters.low_stock) {
      countQuery += ` AND COALESCE(iws.current_balance, i.current_balance) <= iws.min_stock_level`;
    }
    if (filters.overstock) {
      countQuery += ` AND COALESCE(iws.current_balance, i.current_balance) >= iws.max_stock_level`;
    }
    if (filters.search) {
      countQuery += ` AND (i.item_code ILIKE $${countIdx} OR i.name_ar ILIKE $${countIdx})`;
      countParams.push(`%${filters.search}%`);
      countIdx++;
    }

    const [itemsRes, countRes] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const items = itemsRes.rows;
    const total = countRes.rows[0].total;

    const itemIds = items.map((r: any) => r.id);
    let movements: any[] = [];
    if (itemIds.length > 0) {
      const movRes = await pool.query(
        `SELECT item_id,
                COUNT(*)::int AS total_movements,
                COALESCE(SUM(CASE WHEN movement_type = 'IN' THEN quantity_change ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN movement_type = 'OUT' THEN quantity_change ELSE 0 END), 0) AS total_out
         FROM stock_movements
         WHERE item_id = ANY($1::int[])
         GROUP BY item_id`,
        [itemIds]
      );
      movements = movRes.rows;
    }

    const movementMap = new Map(movements.map((m: any) => [m.item_id, m]));

    const result = items.map((item: any) => ({
      ...item,
      stock_summary: movementMap.get(item.id) || { total_movements: 0, total_in: 0, total_out: 0 },
    }));

    const pagination: PaginationMeta = {
      page: filters.page || 1,
      limit: filters.limit || 20,
      total,
      totalPages: filters.limit ? Math.ceil(total / filters.limit) : 1,
    };

    return { items: result, pagination };
  }
}

export const inventoryReportService = new InventoryReportService();
