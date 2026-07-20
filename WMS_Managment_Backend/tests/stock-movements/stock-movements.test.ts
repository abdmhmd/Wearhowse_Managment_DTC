import { pool } from '../../src/config/database';
import { stockMovementsService } from '../../src/modules/stock-movements/stock-movements.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}sm_test_`;

let catCode: string;
let unitCode: string;
let whId: number;
let userId: number;
let itemId: number;
let txId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  userId = await seedUser();
  itemId = await seedItem(catCode, unitCode, whId, 100);

  const txRes = await pool.query(
    `INSERT INTO transactions (transaction_no, type, status, warehouse_id, created_by)
     VALUES ($1, 'RV', 'approved', $2, $3) RETURNING id`,
    [`${prefix}${shortId()}`, whId, userId]
  );
  txId = txRes.rows[0].id;

  await pool.query(
    `INSERT INTO stock_movements (item_id, transaction_id, movement_type, quantity_before, quantity_change, quantity_after, user_id)
     VALUES ($1, $2, 'IN', 0, 100, 100, $3)`,
    [itemId, txId, userId]
  );
});
afterAll(async () => { await cleanup(prefix); });

describe('stock-movements read', () => {
  test('getAll', async () => {
    const { items } = await stockMovementsService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('getByItemId', async () => {
    const result = await stockMovementsService.getByItemId(itemId);
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].item_id).toBe(itemId);
  });

  test('getByTransactionId', async () => {
    const result = await stockMovementsService.getByTransactionId(txId);
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].transaction_id).toBe(txId);
  });
});