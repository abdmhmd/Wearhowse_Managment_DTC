import { pool } from '../../src/config/database';
import { alertsRepository } from '../../src/modules/alerts/alerts.repository';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}alerts_`;

let catCode: string;
let unitCode: string;
let whId: number;
let earlyItemId: number;   // alert window 7 days
let lateItemId: number;    // alert window 100 days
let earlyBatchId: number;
let lateBatchId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();

  // Both batches expire in ~20 days. Only the item with the wider
  // expiry_alert_days window should trigger an alert.
  earlyItemId = await seedItem(catCode, unitCode, whId, 100, { expiry_alert_days: 7 });
  lateItemId = await seedItem(catCode, unitCode, whId, 100, { expiry_alert_days: 100 });

  const expiringIn20Days = "NOW() + INTERVAL '20 days'";
  const early = await pool.query(
    `INSERT INTO batches (item_id, warehouse_id, batch_number, expiry_date, quantity, unit_code)
     VALUES ($1, $2, $3, ${expiringIn20Days}, 10, $4) RETURNING id`,
    [earlyItemId, whId, `${prefix}early`, unitCode]
  );
  earlyBatchId = early.rows[0].id;

  const late = await pool.query(
    `INSERT INTO batches (item_id, warehouse_id, batch_number, expiry_date, quantity, unit_code)
     VALUES ($1, $2, $3, ${expiringIn20Days}, 10, $4) RETURNING id`,
    [lateItemId, whId, `${prefix}late`, unitCode]
  );
  lateBatchId = late.rows[0].id;
});
afterAll(async () => {
  await pool.query('DELETE FROM alerts WHERE batch_id IN ($1, $2)', [earlyBatchId, lateBatchId]);
  await pool.query('DELETE FROM batches WHERE id IN ($1, $2)', [earlyBatchId, lateBatchId]);
  await cleanup(prefix);
});

describe('per-item expiry alert days', () => {
  test('only the item with a wide enough window gets an alert', async () => {
    const count = await alertsRepository.generateExpiryAlerts();

    const earlyAlerts = await pool.query(
      'SELECT * FROM alerts WHERE batch_id = $1 AND type = $2 AND status = $3',
      [earlyBatchId, 'expiry_warning', 'active']
    );
    const lateAlerts = await pool.query(
      'SELECT * FROM alerts WHERE batch_id = $1 AND type = $2 AND status = $3',
      [lateBatchId, 'expiry_warning', 'active']
    );

    expect(earlyAlerts.rows).toHaveLength(0);
    expect(lateAlerts.rows).toHaveLength(1);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('generateExpiryAlerts is idempotent for the same batch', async () => {
    const count = await alertsRepository.generateExpiryAlerts();
    const lateAlerts = await pool.query(
      'SELECT * FROM alerts WHERE batch_id = $1 AND type = $2 AND status = $3',
      [lateBatchId, 'expiry_warning', 'active']
    );
    expect(lateAlerts.rows).toHaveLength(1);
    void count;
  });
});
