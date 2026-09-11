import { pool } from '../../src/config/database';
import { transactionsService } from '../../src/modules/transactions/transactions.service';
import { randomBytes } from 'crypto';

function shortId(): string {
  return randomBytes(4).toString('hex');
}

const TEST_PREFIX = `test_${Date.now()}_`;
const createdIds: { users: number[]; items: number[]; transactions: number[]; details: number[] } = {
  users: [],
  items: [],
  transactions: [],
  details: [],
};

async function seedUser(): Promise<number> {
  const username = `${TEST_PREFIX}user_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ($1, 'hash', $2, 'admin', true) RETURNING id`,
    [username, username]
  );
  createdIds.users.push(res.rows[0].id);
  return res.rows[0].id;
}

async function seedCategory(): Promise<string> {
  const code = `${TEST_PREFIX}cat_${shortId()}`;
  await pool.query(
    `INSERT INTO categories (code, name_ar) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
    [code, code]
  );
  return code;
}

async function seedUnit(): Promise<string> {
  const code = `${TEST_PREFIX}unit_${shortId()}`;
  await pool.query(
    `INSERT INTO units (code, name_ar, name_en) VALUES ($1, $2, $2) ON CONFLICT (code) DO NOTHING`,
    [code, code]
  );
  return code;
}

async function seedWarehouse(): Promise<number> {
  const code = `${TEST_PREFIX}wh_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO warehouses (code, name_ar) VALUES ($1, $2) RETURNING id`,
    [code, code]
  );
  return res.rows[0].id;
}

async function seedItem(
  categoryCode: string,
  unitCode: string,
  warehouseId: number,
  balance: number
): Promise<number> {
  const itemCode = `${TEST_PREFIX}item_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO items (item_code, name_ar, category_code, unit_code, warehouse_id, current_balance, min_stock_level, max_stock_level)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 999999) RETURNING id`,
    [itemCode, itemCode, categoryCode, unitCode, warehouseId, balance]
  );
  createdIds.items.push(res.rows[0].id);
  return res.rows[0].id;
}

async function seedDraftTransaction(
  type: 'RV' | 'LN' | 'ADJ' | 'TRF' | 'RTV' | 'RTI',
  warehouseId: number,
  userId: number,
  toWarehouseId?: number
): Promise<number> {
  const txNo = `${TEST_PREFIX}tx_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO transactions (transaction_no, type, status, warehouse_id, to_warehouse_id, created_by)
     VALUES ($1, $2, 'draft', $3, $4, $5) RETURNING id`,
    [txNo, type, warehouseId, toWarehouseId ?? null, userId]
  );
  createdIds.transactions.push(res.rows[0].id);
  return res.rows[0].id;
}

async function seedTransactionDetail(
  transactionId: number,
  itemId: number,
  unitCode: string,
  quantity: number
): Promise<void> {
  const res = await pool.query(
    `INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price)
     VALUES ($1, $2, $3, $4, 1) RETURNING id`,
    [transactionId, itemId, quantity, unitCode]
  );
  createdIds.details.push(res.rows[0].id);
}

let catCode: string;
let unitCode: string;
let whId: number;
let userId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  userId = await seedUser();
});

afterAll(async () => {
  await pool.query('DELETE FROM stock_movements USING transactions WHERE stock_movements.transaction_id = transactions.id AND transactions.transaction_no LIKE $1', [`${TEST_PREFIX}%`]);
  await pool.query('DELETE FROM transaction_details USING transactions WHERE transaction_details.transaction_id = transactions.id AND transactions.transaction_no LIKE $1', [`${TEST_PREFIX}%`]);
  await pool.query('DELETE FROM transactions WHERE transaction_no LIKE $1', [`${TEST_PREFIX}%`]);
  await pool.query('DELETE FROM batches WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE $1)', [`${TEST_PREFIX}%`]);
  await pool.query('DELETE FROM items WHERE item_code LIKE $1', [`${TEST_PREFIX}%`]);
  await pool.query('DELETE FROM warehouses WHERE code LIKE $1', [`${TEST_PREFIX}%`]);
  await pool.query('DELETE FROM categories WHERE code LIKE $1', [`${TEST_PREFIX}%`]);
  await pool.query('DELETE FROM units WHERE code LIKE $1', [`${TEST_PREFIX}%`]);
  await pool.query('DELETE FROM users WHERE username LIKE $1', [`${TEST_PREFIX}%`]);
});

describe('approveTransaction', () => {
  test('approving RV increases item balance and logs IN movement', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 0);
    const txId = await seedDraftTransaction('RV', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, 50);

    await transactionsService.approveTransaction(txId, userId);

    const item = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemId]);
    expect(parseFloat(item.rows[0].current_balance)).toBe(50);

    const movements = await pool.query(
      'SELECT * FROM stock_movements WHERE transaction_id = $1 AND item_id = $2',
      [txId, itemId]
    );
    expect(movements.rows).toHaveLength(1);
    expect(movements.rows[0].movement_type).toBe('IN');
    expect(parseFloat(movements.rows[0].quantity_before)).toBe(0);
    expect(parseFloat(movements.rows[0].quantity_change)).toBe(50);
    expect(parseFloat(movements.rows[0].quantity_after)).toBe(50);

    const tx = await pool.query('SELECT status, approved_by FROM transactions WHERE id = $1', [txId]);
    expect(tx.rows[0].status).toBe('approved');
    expect(tx.rows[0].approved_by).toBe(userId);
  });

  test('approving LN decreases item balance and logs OUT movement', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 200);
    const txId = await seedDraftTransaction('LN', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, 30);

    await transactionsService.approveTransaction(txId, userId);

    const item = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemId]);
    expect(parseFloat(item.rows[0].current_balance)).toBe(170);

    const movements = await pool.query(
      'SELECT * FROM stock_movements WHERE transaction_id = $1 AND item_id = $2',
      [txId, itemId]
    );
    expect(movements.rows).toHaveLength(1);
    expect(movements.rows[0].movement_type).toBe('OUT');
    expect(parseFloat(movements.rows[0].quantity_before)).toBe(200);
    expect(parseFloat(movements.rows[0].quantity_change)).toBe(-30);
    expect(parseFloat(movements.rows[0].quantity_after)).toBe(170);
  });

  test('throws on insufficient balance for LN', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 10);
    const txId = await seedDraftTransaction('LN', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, 100);

    await expect(transactionsService.approveTransaction(txId, userId)).rejects.toThrow(
      /Insufficient balance/
    );

    const item = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemId]);
    expect(parseFloat(item.rows[0].current_balance)).toBe(10);

    const movements = await pool.query(
      'SELECT * FROM stock_movements WHERE transaction_id = $1',
      [txId]
    );
    expect(movements.rows).toHaveLength(0);

    const tx = await pool.query('SELECT status FROM transactions WHERE id = $1', [txId]);
    expect(tx.rows[0].status).toBe('draft');
  });

  test('throws on double approval', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 100);
    const txId = await seedDraftTransaction('RV', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, 10);

    await transactionsService.approveTransaction(txId, userId);

    await expect(transactionsService.approveTransaction(txId, userId)).rejects.toThrow(
      /already approved/
    );
  });

  test('approving ADJ with positive quantity increases balance (IN)', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 50);
    const txId = await seedDraftTransaction('ADJ', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, 30);

    await transactionsService.approveTransaction(txId, userId);

    const item = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemId]);
    expect(parseFloat(item.rows[0].current_balance)).toBe(80);

    const movements = await pool.query(
      'SELECT * FROM stock_movements WHERE transaction_id = $1 AND item_id = $2',
      [txId, itemId]
    );
    expect(movements.rows).toHaveLength(1);
    expect(movements.rows[0].movement_type).toBe('IN');
  });

  test('approving ADJ with negative quantity decreases balance (OUT)', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 100);
    const txId = await seedDraftTransaction('ADJ', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, -20);

    await transactionsService.approveTransaction(txId, userId);

    const item = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemId]);
    expect(parseFloat(item.rows[0].current_balance)).toBe(80);

    const movements = await pool.query(
      'SELECT * FROM stock_movements WHERE transaction_id = $1 AND item_id = $2',
      [txId, itemId]
    );
    expect(movements.rows).toHaveLength(1);
    expect(movements.rows[0].movement_type).toBe('OUT');
  });

  test('approving TRF deducts source and adds to destination warehouse', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 200);
    const destWhId = await seedWarehouse();
    const txId = await seedDraftTransaction('TRF', whId, userId, destWhId);
    await seedTransactionDetail(txId, itemId, unitCode, 50);

    await transactionsService.approveTransaction(txId, userId);

    const movements = await pool.query(
      `SELECT movement_type, quantity_change FROM stock_movements
       WHERE transaction_id = $1 AND item_id = $2 ORDER BY id`,
      [txId, itemId]
    );
    expect(movements.rows).toHaveLength(2);
    expect(movements.rows[0].movement_type).toBe('OUT');
    expect(parseFloat(movements.rows[0].quantity_change)).toBe(-50);
    expect(movements.rows[1].movement_type).toBe('IN');
    expect(parseFloat(movements.rows[1].quantity_change)).toBe(50);
  });

  test('approving RTI is IN movement', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 0);
    const txId = await seedDraftTransaction('RTI', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, 40);

    await transactionsService.approveTransaction(txId, userId);

    const movements = await pool.query(
      'SELECT movement_type FROM stock_movements WHERE transaction_id = $1 AND item_id = $2',
      [txId, itemId]
    );
    expect(movements.rows[0].movement_type).toBe('IN');
  });

  test('approving RTV is OUT movement', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 100);
    const txId = await seedDraftTransaction('RTV', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, 20);

    await transactionsService.approveTransaction(txId, userId);

    const movements = await pool.query(
      'SELECT movement_type FROM stock_movements WHERE transaction_id = $1 AND item_id = $2',
      [txId, itemId]
    );
    expect(movements.rows[0].movement_type).toBe('OUT');
  });

  test('throws on non-existing transaction', async () => {
    await expect(transactionsService.approveTransaction(999999999, userId)).rejects.toThrow(
      /Transaction not found/
    );
  });

  test('logs correct stock movement with before/after quantities', async () => {
    const itemId = await seedItem(catCode, unitCode, whId, 100);
    const txId = await seedDraftTransaction('RV', whId, userId);
    await seedTransactionDetail(txId, itemId, unitCode, 25);

    await transactionsService.approveTransaction(txId, userId);

    const movements = await pool.query(
      `SELECT movement_type, quantity_before, quantity_change, quantity_after, user_id, item_id, transaction_id
       FROM stock_movements WHERE transaction_id = $1`,
      [txId]
    );
    expect(movements.rows).toHaveLength(1);

    const mov = movements.rows[0];
    expect(mov.movement_type).toBe('IN');
    expect(parseFloat(mov.quantity_before)).toBe(100);
    expect(parseFloat(mov.quantity_change)).toBe(25);
    expect(parseFloat(mov.quantity_after)).toBe(125);
    expect(mov.user_id).toBe(userId);
    expect(mov.item_id).toBe(itemId);
    expect(mov.transaction_id).toBe(txId);
  });
});
