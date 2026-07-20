import { pool } from '../../src/config/database';
import { transactionsService } from '../../src/modules/transactions/transactions.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}tx_test_`;

let catCode: string;
let unitCode: string;
let whId: number;
let userId: number;
let itemId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  userId = await seedUser();
  itemId = await seedItem(catCode, unitCode, whId, 500);
});
afterAll(async () => { await cleanup(prefix); });

describe('transactions CRUD', () => {
  test('createDraft (RV)', async () => {
    const txNo = `${prefix}${shortId()}`;
    const result = await transactionsService.createDraft(
      { transaction_no: txNo, type: 'RV', warehouse_id: whId, created_by: userId },
      [{ item_id: itemId, quantity: 10, unit_code: unitCode, unit_price: 5 }]
    );
    expect(result.transaction_no).toBe(txNo);
    expect(result.status).toBe('draft');
    expect(result.details).toHaveLength(1);
    expect(result.details[0].item_id).toBe(itemId);
  });

  test('getAll', async () => {
    const { items } = await transactionsService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('createDraft (LN)', async () => {
    const txNo = `${prefix}${shortId()}`;
    const result = await transactionsService.createDraft(
      { transaction_no: txNo, type: 'LN', warehouse_id: whId, created_by: userId },
      [{ item_id: itemId, quantity: 5, unit_code: unitCode, unit_price: 10 }]
    );
    expect(result.status).toBe('draft');
    expect(result.details).toHaveLength(1);
  });

  test('getAll returns pagination metadata', async () => {
    const { items, pagination } = await transactionsService.getAll(1, 10);
    expect(pagination.page).toBe(1);
    expect(pagination.limit).toBe(10);
    expect(pagination.total).toBeGreaterThanOrEqual(2);
    expect(pagination.totalPages).toBeGreaterThanOrEqual(1);
  });
});