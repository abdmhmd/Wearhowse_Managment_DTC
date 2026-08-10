import { PoolClient } from 'pg';
import { pool } from '../../config/database';
import { warehouseAccessClause } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export interface StockMovementInput {
  item_id: number;
  transaction_id: number;
  movement_type: 'IN' | 'OUT';
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  user_id: number;
  /** The warehouse where the movement physically happened. This is the source
   *  of truth for movement-level data scoping (never the item's home
   *  warehouse). */
  warehouse_id: number;
}

export class StockMovementsRepository {
  async findAll(limit?: number, offset?: number, user?: AuthUserContext) {
    let query = `SELECT sm.id, sm.item_id, sm.transaction_id, sm.movement_type, sm.quantity_before, sm.quantity_change, sm.quantity_after, sm.movement_date, sm.user_id, sm.warehouse_id,
                        i.item_code, i.name_ar AS item_name_ar,
                        w.name_ar AS warehouse_name_ar
                 FROM stock_movements sm
                 JOIN items i ON i.id = sm.item_id
                 LEFT JOIN warehouses w ON w.id = sm.warehouse_id
                 WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (user) {
      const scope = warehouseAccessClause(user, 'sm.warehouse_id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
        paramIndex += scope.params.length;
      }
    }

    query += ' ORDER BY sm.movement_date DESC';
    if (limit !== undefined && offset !== undefined) {
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);
    }
    const res = await pool.query(query, params);
    return res.rows;
  }

  async countAll(user?: AuthUserContext) {
    let query = `SELECT COUNT(*)::int AS total FROM stock_movements sm WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;
    if (user) {
      const scope = warehouseAccessClause(user, 'sm.warehouse_id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
      }
    }
    const res = await pool.query(query, params);
    return res.rows[0].total;
  }

  async findByItemId(item_id: number, limit?: number, offset?: number, user?: AuthUserContext) {
    let query = `SELECT sm.id, sm.item_id, sm.transaction_id, sm.movement_type, sm.quantity_before, sm.quantity_change, sm.quantity_after, sm.movement_date, sm.user_id, sm.warehouse_id,
                        t.transaction_no, t.type AS transaction_type,
                        i.item_code, i.name_ar AS item_name_ar,
                        w.name_ar AS warehouse_name_ar
                 FROM stock_movements sm
                 JOIN transactions t ON t.id = sm.transaction_id
                 JOIN items i ON i.id = sm.item_id
                 LEFT JOIN warehouses w ON w.id = sm.warehouse_id
                 WHERE sm.item_id = $1`;
    const params: any[] = [item_id];
    let paramIndex = 2;

    if (user) {
      const scope = warehouseAccessClause(user, 'sm.warehouse_id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
        paramIndex += scope.params.length;
      }
    }

    query += ' ORDER BY sm.movement_date DESC';
    if (limit !== undefined && offset !== undefined) {
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);
    }
    const res = await pool.query(query, params);
    return res.rows;
  }

  async findByTransactionId(transaction_id: number, limit?: number, offset?: number, user?: AuthUserContext) {
    let query = `SELECT sm.id, sm.item_id, sm.transaction_id, sm.movement_type, sm.quantity_before, sm.quantity_change, sm.quantity_after, sm.movement_date, sm.user_id, sm.warehouse_id,
                        t.transaction_no, t.type AS transaction_type,
                        i.item_code, i.name_ar AS item_name_ar,
                        w.name_ar AS warehouse_name_ar
                 FROM stock_movements sm
                 JOIN transactions t ON t.id = sm.transaction_id
                 JOIN items i ON i.id = sm.item_id
                 LEFT JOIN warehouses w ON w.id = sm.warehouse_id
                 WHERE sm.transaction_id = $1`;
    const params: any[] = [transaction_id];
    let paramIndex = 2;

    if (user) {
      const scope = warehouseAccessClause(user, 'sm.warehouse_id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
        paramIndex += scope.params.length;
      }
    }

    query += ' ORDER BY sm.movement_date DESC';
    if (limit !== undefined && offset !== undefined) {
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);
    }
    const res = await pool.query(query, params);
    return res.rows;
  }

  async countByItemId(item_id: number, user?: AuthUserContext) {
    let query = `SELECT COUNT(*)::int AS total FROM stock_movements sm WHERE sm.item_id = $1`;
    const params: any[] = [item_id];
    let paramIndex = 2;
    if (user) {
      const scope = warehouseAccessClause(user, 'sm.warehouse_id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
      }
    }
    const res = await pool.query(query, params);
    return res.rows[0].total;
  }

  async countByTransactionId(transaction_id: number, user?: AuthUserContext) {
    let query = `SELECT COUNT(*)::int AS total FROM stock_movements sm WHERE sm.transaction_id = $1`;
    const params: any[] = [transaction_id];
    let paramIndex = 2;
    if (user) {
      const scope = warehouseAccessClause(user, 'sm.warehouse_id', paramIndex);
      if (scope.clause !== 'TRUE') {
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
      }
    }
    const res = await pool.query(query, params);
    return res.rows[0].total;
  }

  async logMovement(client: PoolClient, movement: StockMovementInput) {
    const query = `
      INSERT INTO stock_movements (item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, user_id, warehouse_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const values = [
      movement.item_id,
      movement.transaction_id,
      movement.movement_type,
      movement.quantity_before,
      movement.quantity_change,
      movement.quantity_after,
      movement.user_id,
      movement.warehouse_id
    ];
    await client.query(query, values);
  }
}
export const stockMovementsRepository = new StockMovementsRepository();
