import { pool } from '../../src/config/database';
import { transactionsService } from '../../src/modules/transactions/transactions.service';
import { transactionDetailSchema } from '../../src/modules/transactions/transactions.validator';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}tx_expiry_`;

let catCode: string;
let unitCode: string;
let altUnitCode: string;
let whId: number;
let userId: number;
let itemId: number;

function toUtcDateString(value: any): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  altUnitCode = await seedUnit();
  whId = await seedWarehouse();
  userId = await seedUser();
  itemId = await seedItem(catCode, unitCode, whId, 500);
  await pool.query(
    `INSERT INTO unit_conversions (item_id, from_unit_code, to_unit_code, factor) VALUES ($1, $2, $3, 12)`,
    [itemId, unitCode, altUnitCode]
  );
});
afterAll(async () => { await cleanup(prefix); });

describe('transaction unit persistence', () => {
  test('createDraft accepts the item default unit', async () => {
    const result = await transactionsService.createDraft(
      { transaction_no: `${prefix}${shortId()}`, type: 'RV', warehouse_id: whId, created_by: userId },
      [{ item_id: itemId, quantity: 10, unit_code: unitCode, unit_price: 5 }]
    );
    expect(result.details[0].unit_code).toBe(unitCode);
  });

  test('createDraft accepts a unit convertible from the default unit', async () => {
    const result = await transactionsService.createDraft(
      { transaction_no: `${prefix}${shortId()}`, type: 'RV', warehouse_id: whId, created_by: userId },
      [{ item_id: itemId, quantity: 1, unit_code: altUnitCode, unit_price: 5 }]
    );
    expect(result.details[0].unit_code).toBe(altUnitCode);
  });

  test('createDraft rejects a unit not valid for the item', async () => {
    const bogusUnit = await seedUnit();
    await expect(
      transactionsService.createDraft(
        { transaction_no: `${prefix}${shortId()}`, type: 'RV', warehouse_id: whId, created_by: userId },
        [{ item_id: itemId, quantity: 1, unit_code: bogusUnit, unit_price: 5 }]
      )
    ).rejects.toThrow(/not valid for item/);
  });

  test('createDraft rejects a non-existent item', async () => {
    await expect(
      transactionsService.createDraft(
        { transaction_no: `${prefix}${shortId()}`, type: 'RV', warehouse_id: whId, created_by: userId },
        [{ item_id: 999999999, quantity: 1, unit_code: unitCode, unit_price: 5 }]
      )
    ).rejects.toThrow(/not found/);
  });
});

describe('transaction expiry tracking', () => {
  test('createDraft persists production_date and expiry_date', async () => {
    const result = await transactionsService.createDraft(
      { transaction_no: `${prefix}${shortId()}`, type: 'RV', warehouse_id: whId, created_by: userId },
      [{
        item_id: itemId, quantity: 10, unit_code: unitCode, unit_price: 5,
        batch_number: `${prefix}bat1`,
        expiry_tracking_enabled: true,
        production_date: '2026-01-01',
        expiry_date: '2027-01-01',
      }]
    );
    const detail = result.details[0];
    expect(detail.expiry_tracking_enabled).toBe(true);
    const stored = await pool.query(
      'SELECT production_date, expiry_date, expiry_tracking_enabled FROM transaction_details WHERE id = $1',
      [detail.id]
    );
    expect(toUtcDateString(stored.rows[0].expiry_date)).toBe('2027-01-01');
    expect(toUtcDateString(stored.rows[0].production_date)).toBe('2026-01-01');
    expect(stored.rows[0].expiry_tracking_enabled).toBe(true);
  });

  test('approveTransaction creates a batch with the expiry dates', async () => {
    const txNo = `${prefix}${shortId()}`;
    const draft = await transactionsService.createDraft(
      { transaction_no: txNo, type: 'RV', warehouse_id: whId, created_by: userId },
      [{
        item_id: itemId, quantity: 7, unit_code: unitCode, unit_price: 5,
        batch_number: `${prefix}bat2`,
        expiry_tracking_enabled: true,
        production_date: '2026-02-01',
        expiry_date: '2027-02-01',
      }]
    );
    await transactionsService.approveTransaction(draft.id!, userId);

    const batch = await pool.query(
      'SELECT batch_number, production_date, expiry_date, quantity FROM batches WHERE batch_number = $1 AND item_id = $2',
      [`${prefix}bat2`, itemId]
    );
    expect(batch.rows).toHaveLength(1);
    expect(toUtcDateString(batch.rows[0].expiry_date)).toBe('2027-02-01');
    expect(toUtcDateString(batch.rows[0].production_date)).toBe('2026-02-01');
    expect(parseFloat(batch.rows[0].quantity)).toBe(7);
  });

  test('approveTransaction auto-generates a batch number when missing on RV', async () => {
    const draft = await transactionsService.createDraft(
      { transaction_no: `${prefix}${shortId()}`, type: 'RV', warehouse_id: whId, created_by: userId },
      [{ item_id: itemId, quantity: 3, unit_code: unitCode, unit_price: 5 }]
    );
    await transactionsService.approveTransaction(draft.id!, userId);

    const batch = await pool.query(
      'SELECT * FROM batches WHERE item_id = $1 AND transaction_id = $2',
      [itemId, draft.id]
    );
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0].batch_number).toMatch(/^BAT-\d{8}-/);
    expect(parseFloat(batch.rows[0].quantity)).toBe(3);
  });

  test('approveTransaction rejects expiry tracking without an expiry date', async () => {
    const draft = await transactionsService.createDraft(
      { transaction_no: `${prefix}${shortId()}`, type: 'RV', warehouse_id: whId, created_by: userId },
      [{ item_id: itemId, quantity: 1, unit_code: unitCode, unit_price: 5 }]
    );
    // Seed a detail directly with tracking enabled but no expiry date (bypasses validator)
    await pool.query(
      `UPDATE transaction_details SET expiry_tracking_enabled = true WHERE transaction_id = $1`,
      [draft.id!]
    );
    await expect(transactionsService.approveTransaction(draft.id!, userId)).rejects.toThrow(
      /Expiry date is required/
    );
  });

  test('createDraft rejects production_date later than expiry_date (DB check)', async () => {
    await expect(
      transactionsService.createDraft(
        { transaction_no: `${prefix}${shortId()}`, type: 'RV', warehouse_id: whId, created_by: userId },
        [{
          item_id: itemId, quantity: 1, unit_code: unitCode, unit_price: 5,
          expiry_tracking_enabled: true,
          production_date: '2027-06-01',
          expiry_date: '2027-01-01',
        }]
      )
    ).rejects.toThrow();
  });

  test('validator requires expiry_date when tracking is enabled', () => {
    const parsed = transactionDetailSchema.safeParse({
      item_id: 1, quantity: 1, unit_code: 'PCS',
      expiry_tracking_enabled: true, production_date: '2026-01-01',
    });
    expect(parsed.success).toBe(false);
  });

  test('validator rejects expiry_date when tracking is disabled', () => {
    const parsed = transactionDetailSchema.safeParse({
      item_id: 1, quantity: 1, unit_code: 'PCS',
      expiry_tracking_enabled: false, expiry_date: '2027-01-01',
    });
    expect(parsed.success).toBe(false);
  });

  test('validator rejects production_date later than expiry_date', () => {
    const parsed = transactionDetailSchema.safeParse({
      item_id: 1, quantity: 1, unit_code: 'PCS',
      expiry_tracking_enabled: true,
      production_date: '2027-06-01', expiry_date: '2027-01-01',
    });
    expect(parsed.success).toBe(false);
  });

  test('validator accepts a valid expiry line', () => {
    const parsed = transactionDetailSchema.safeParse({
      item_id: 1, quantity: 1, unit_code: 'PCS',
      expiry_tracking_enabled: true,
      production_date: '2026-01-01', expiry_date: '2027-01-01',
    });
    expect(parsed.success).toBe(true);
  });
});
