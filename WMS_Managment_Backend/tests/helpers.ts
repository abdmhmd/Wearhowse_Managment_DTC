import { pool } from '../src/config/database';
import { randomBytes } from 'crypto';
import { PoolClient } from 'pg';

export function shortId(): string {
  return randomBytes(4).toString('hex');
}

export const TEST_PREFIX = `test_${Date.now()}_`;

export async function seedUser(isActive = true): Promise<number> {
  const username = `${TEST_PREFIX}user_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ($1, 'dummy_hash', $2, 'system_admin', $3) RETURNING id`,
    [username, username, isActive]
  );
  return res.rows[0].id;
}

export async function seedCategory(): Promise<string> {
  const code = `${TEST_PREFIX}cat_${shortId()}`;
  await pool.query(
    `INSERT INTO categories (code, name_ar) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET is_active = true`,
    [code, code]
  );
  return code;
}

export async function seedUnit(): Promise<string> {
  const code = `${TEST_PREFIX}unit_${shortId()}`;
  await pool.query(
    `INSERT INTO units (code, name_ar, name_en) VALUES ($1, $2, $2) ON CONFLICT (code) DO UPDATE SET is_active = true`,
    [code, code]
  );
  return code;
}

export async function seedWarehouse(): Promise<number> {
  const code = `${TEST_PREFIX}wh_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO warehouses (code, name_ar) VALUES ($1, $2) RETURNING id`,
    [code, code]
  );
  return res.rows[0].id;
}

export async function seedItem(
  categoryCode: string, unitCode: string, warehouseId: number, balance = 0
): Promise<number> {
  const itemCode = `${TEST_PREFIX}item_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO items (item_code, name_ar, category_code, unit_code, warehouse_id, current_balance, min_stock_level, max_stock_level)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 999999) RETURNING id`,
    [itemCode, itemCode, categoryCode, unitCode, warehouseId, balance]
  );
  return res.rows[0].id;
}

export async function cleanup(prefix: string): Promise<void> {
  await pool.query('DELETE FROM stock_movements USING transactions WHERE stock_movements.transaction_id = transactions.id AND transactions.transaction_no LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM transaction_details USING transactions WHERE transaction_details.transaction_id = transactions.id AND transactions.transaction_no LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM transactions WHERE transaction_no LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM unit_conversions WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)', [`${prefix}%`]);
  await pool.query('DELETE FROM items WHERE item_code LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM warehouses WHERE code LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM categories WHERE code LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM units WHERE code LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM users WHERE username LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM suppliers WHERE name_ar LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM departments WHERE code LIKE $1', [`${prefix}%`]);
}
