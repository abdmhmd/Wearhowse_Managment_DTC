import { PoolClient } from 'pg';
import { pool } from '../../config/database';

export interface StockMovementInput {
  item_id: number;
  transaction_id: number;
  movement_type: 'IN' | 'OUT';
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  user_id: number;
}

export class StockMovementsRepository {
  async findAll(limit?: number, offset?: number) {
    let query = 'SELECT id, item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, movement_date, user_id FROM stock_movements ORDER BY movement_date DESC';
    const params: any[] = [];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }
    const res = params.length ? await pool.query(query, params) : await pool.query(query);
    return res.rows;
  }

  async countAll() {
    const res = await pool.query('SELECT COUNT(*)::int AS total FROM stock_movements');
    return res.rows[0].total;
  }

  async findByItemId(item_id: number, limit?: number, offset?: number) {
    let query = 'SELECT id, item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, movement_date, user_id FROM stock_movements WHERE item_id = $1 ORDER BY movement_date DESC';
    const params: any[] = [item_id];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $2 OFFSET $3';
      params.push(limit, offset);
    }
    const res = await pool.query(query, params);
    return res.rows;
  }

  async findByTransactionId(transaction_id: number, limit?: number, offset?: number) {
    let query = 'SELECT id, item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, movement_date, user_id FROM stock_movements WHERE transaction_id = $1 ORDER BY movement_date DESC';
    const params: any[] = [transaction_id];
    if (limit !== undefined && offset !== undefined) {
      query += ' LIMIT $2 OFFSET $3';
      params.push(limit, offset);
    }
    const res = await pool.query(query, params);
    return res.rows;
  }

  async countByItemId(item_id: number) {
    const res = await pool.query('SELECT COUNT(*)::int AS total FROM stock_movements WHERE item_id = $1', [item_id]);
    return res.rows[0].total;
  }

  async countByTransactionId(transaction_id: number) {
    const res = await pool.query('SELECT COUNT(*)::int AS total FROM stock_movements WHERE transaction_id = $1', [transaction_id]);
    return res.rows[0].total;
  }

  async logMovement(client: PoolClient, movement: StockMovementInput) {
    const query = `
      INSERT INTO stock_movements (item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    const values = [
      movement.item_id,
      movement.transaction_id,
      movement.movement_type,
      movement.quantity_before,
      movement.quantity_change,
      movement.quantity_after,
      movement.user_id
    ];
    await client.query(query, values);
  }
}
export const stockMovementsRepository = new StockMovementsRepository();
