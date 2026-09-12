import { PaginationMeta } from '../../utils/response';
import { pool } from '../../config/database';
import { warehouseAccessClause, scopeForUser, type DataScope } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';
import { OPEN_ALLOCATIONS_CTE } from '../purchase-orders/stock-availability';

export interface InventoryReportFilters {
  warehouse_id?: number;
  category_code?: string;
  is_active?: boolean;
  low_stock?: boolean;
  overstock?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  /** Current authenticated user — restricts the report to the user's
   *  accessible warehouses (sub_warehouse_manager -> assigned,
   *  department_manager -> department-owned warehouses). */
  user?: AuthUserContext;
}

export class InventoryReportService {
  async getInventoryReport(filters: InventoryReportFilters) {
    let query = `
      WITH ${OPEN_ALLOCATIONS_CTE}
      SELECT
        i.id, i.item_code, i.name_ar, i.description,
        i.warehouse_id, i.category_code,
        COALESCE(iws.current_balance, i.current_balance) AS current_balance,
        COALESCE(iws.current_balance, i.current_balance) AS physical_stock,
        COALESCE(oa.allocated_qty, 0) AS allocated_stock,
        GREATEST(COALESCE(iws.current_balance, i.current_balance) - COALESCE(oa.allocated_qty, 0), 0) AS available_stock,
        iws.min_stock_level, iws.max_stock_level,
        i.location, i.is_active,
        c.name_ar AS category_name,
        u.name_ar AS unit_name,
        w.name_ar AS warehouse_name, w.code AS warehouse_code
      FROM items i
      LEFT JOIN item_warehouse_stock iws ON iws.item_id = i.id AND (iws.warehouse_id = i.warehouse_id)
      LEFT JOIN open_allocations oa ON oa.item_id = i.id AND oa.source_warehouse_id = (iws.warehouse_id)
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

    if (filters.user) {
      const scope = warehouseAccessClause(filters.user, 'i.warehouse_id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
        paramIndex += scope.params.length;
      }
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
    if (filters.user) {
      const scope = warehouseAccessClause(filters.user, 'i.warehouse_id', countIdx);
      if (scope.clause !== 'TRUE') {
        countQuery += ` AND ${scope.clause}`;
        countParams.push(...scope.params);
      }
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
      // The stock summary must include ONLY movements from warehouses the
      // current user may access (admin = all). Otherwise a
      // warehouse/department manager would leak other warehouses' movement
      // totals through the aggregated counters.
      const movementParams: any[] = [itemIds];
      let movementWh = '';
      if (filters.user) {
        const scope: DataScope = scopeForUser(filters.user);
        if (scope === 'WAREHOUSE' && filters.user.warehouse_ids.length > 0) {
          movementWh = ` AND sm.warehouse_id = ANY($${movementParams.length + 1})`;
          movementParams.push(filters.user.warehouse_ids);
        } else if (scope === 'DEPARTMENT') {
          const parts: string[] = [];
          let idx = movementParams.length + 1;
          if (filters.user.department_id != null) {
            // D11: a department_manager never sees main-warehouse movements.
            const excludeMain = filters.user.role === 'department_manager' ? ' AND w.is_main = false' : '';
            parts.push(
              `sm.warehouse_id IN (SELECT w.id FROM warehouses w WHERE w.department_id = $${idx} AND w.is_active = true${excludeMain})`
            );
            movementParams.push(filters.user.department_id);
            idx++;
          }
          if (filters.user.warehouse_ids.length > 0) {
            parts.push(`sm.warehouse_id = ANY($${idx})`);
            movementParams.push(filters.user.warehouse_ids);
          }
          if (parts.length === 0) {
            movementWh = ' AND FALSE';
          } else {
            movementWh = ` AND (${parts.join(' OR ')})`;
          }
        } else if (scope === 'NONE') {
          movementWh = ' AND FALSE';
        }
      }

      const movRes = await pool.query(
        `SELECT sm.item_id,
                COUNT(*)::int AS total_movements,
                COALESCE(SUM(CASE WHEN sm.movement_type = 'IN' THEN sm.quantity_change ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN sm.movement_type = 'OUT' THEN sm.quantity_change ELSE 0 END), 0) AS total_out
         FROM stock_movements sm
         WHERE sm.item_id = ANY($1::int[])${movementWh}
         GROUP BY sm.item_id`,
        movementParams
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
