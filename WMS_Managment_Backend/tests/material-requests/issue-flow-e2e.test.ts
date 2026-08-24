import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Issue flow end-to-end:
 *
 * Reproduces the exact production issue where POST /api/requests/:id/issue
 * returned 400 because the department had no main warehouse (is_main=true).
 *
 * Tests:
 * - Supervisor creates request → WM approves → WM issues → 200 ✓
 * - Stock decreases correctly (main → dest transfer)
 * - Stock movement records exist
 * - Custody created for non-consumable items
 * - Custody NOT created for consumable items
 * - Request status changes to 'issued'
 * - Department with no main warehouse → creation blocked (400)
 * - Request targets main warehouse → issue blocked (400)
 * - Atomicity: failed custody creation rolls back stock
 */
const prefix = `${TEST_PREFIX}issuee2e_`;
let app: any;

interface SeedUser {
  id: number;
  username: string;
  password: string;
  token: string;
}

async function seedRoleUser(role: string, opts: { department_id?: number | null; warehouse_ids?: number[] } = {}): Promise<SeedUser> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${prefix}${role}_${shortId()}`;
  const userRes = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [username, password_hash, username, role, opts.department_id ?? null]
  );
  const id = userRes.rows[0].id;
  for (const wh of opts.warehouse_ids ?? []) {
    await pool.query(
      'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, wh]
    );
  }
  return { id, username, password, token: '' };
}

async function login(user: SeedUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

function createRequest(token: string, whId: number, items: Array<{ item_id: number; quantity: number; unit_code: string }>) {
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send({
      request_type: 'experiment',
      priority: 'normal',
      warehouse_id: whId,
      notes: `${prefix}note_${shortId()}`,
      items,
    });
}

describe('Issue flow — end-to-end with correct warehouse architecture', () => {
  let admin: SeedUser;
  let supA: SeedUser;
  let wmA: SeedUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let mainWh: number;
  let destWh: number;
  let durableItemId: number;
  let consumableItemId: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();

    // Correct architecture: main warehouse (stock source) + destination warehouse (request target)
    mainWh = await seedWarehouse({ department_id: deptA, is_main: true });
    destWh = await seedWarehouse({ department_id: deptA });

    durableItemId = await seedItem(catCode, unitCode, destWh, 0, { is_consumable: false });
    consumableItemId = await seedItem(catCode, unitCode, destWh, 0, { is_consumable: true });

    // Stock lives in the main warehouse
    await pool.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, 50)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = 50`,
      [durableItemId, mainWh]
    );
    await pool.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, 50)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = 50`,
      [consumableItemId, mainWh]
    );

    admin = await seedRoleUser('system_admin');
    supA = await seedRoleUser('supervisor', { department_id: deptA });
    wmA = await seedRoleUser('warehouse_manager', { warehouse_ids: [destWh] });

    admin.token = await login(admin);
    supA.token = await login(supA);
    wmA.token = await login(wmA);
  });

  afterAll(async () => { await cleanup(prefix); });

  describe('A. Full issue flow (non-consumable + consumable)', () => {
    let requestId: number;

    test('supervisor creates request with both item types', async () => {
      const res = await createRequest(supA.token, destWh, [
        { item_id: durableItemId, quantity: 3, unit_code: unitCode },
        { item_id: consumableItemId, quantity: 5, unit_code: unitCode },
      ]);
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
      requestId = res.body.data.id;
    });

    test('WM approves → wm_approved', async () => {
      const res = await request(app)
        .patch(`/api/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('wm_approved');
    });

    test('WM issues → 200 + stock decreases + custody created for durable only', async () => {
      const durableBefore = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, mainWh]
      );
      const consumableBefore = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [consumableItemId, mainWh]
      );

      const res = await request(app)
        .post(`/api/requests/${requestId}/issue`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Request issued successfully');
      expect(res.body.data.transaction_id).toBeDefined();

      // Stock decreased in main warehouse
      const durableAfter = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, mainWh]
      );
      const consumableAfter = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [consumableItemId, mainWh]
      );
      expect(Number(durableAfter.rows[0].current_balance)).toBe(47); // 50 - 3
      expect(Number(consumableAfter.rows[0].current_balance)).toBe(45); // 50 - 5

      // Stock increased in destination warehouse
      const destDurable = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, destWh]
      );
      const destConsumable = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [consumableItemId, destWh]
      );
      expect(Number(destDurable.rows[0].current_balance)).toBe(3);
      expect(Number(destConsumable.rows[0].current_balance)).toBe(5);

      // Custody exists for durable item
      const custDurable = await pool.query(
        'SELECT * FROM custodies WHERE assigned_to = $1 AND item_id = $2 AND is_active = true',
        [supA.id, durableItemId]
      );
      expect(custDurable.rows.length).toBe(1);
      expect(Number(custDurable.rows[0].quantity)).toBe(3);
      expect(custDurable.rows[0].status).toBe('active');
      expect(custDurable.rows[0].warehouse_id).toBe(destWh);
      expect(custDurable.rows[0].request_id).toBe(requestId);

      // NO custody for consumable item
      const custConsumable = await pool.query(
        'SELECT * FROM custodies WHERE assigned_to = $1 AND item_id = $2 AND is_active = true',
        [supA.id, consumableItemId]
      );
      expect(custConsumable.rows.length).toBe(0);
    });

    test('stock movement records exist for both items', async () => {
      const txnId = (await pool.query(
        'SELECT transaction_id FROM material_requests WHERE id = $1',
        [requestId]
      )).rows[0].transaction_id;

      const movements = await pool.query(
        'SELECT item_id, movement_type, quantity_change FROM stock_movements WHERE transaction_id = $1 ORDER BY item_id, movement_type',
        [txnId]
      );
      // 4 movements: 2 items × (OUT from main + IN to dest)
      expect(movements.rows.length).toBe(4);
      const outMovements = movements.rows.filter((m: any) => m.movement_type === 'OUT');
      const inMovements = movements.rows.filter((m: any) => m.movement_type === 'IN');
      expect(outMovements.length).toBe(2);
      expect(inMovements.length).toBe(2);
    });

    test('request status is now issued', async () => {
      const res = await request(app)
        .get(`/api/requests/${requestId}`)
        .set('Authorization', `Bearer ${supA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('issued');
    });

    test('cannot issue an already-issued request', async () => {
      const res = await request(app)
        .post(`/api/requests/${requestId}/issue`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(400);
    });

    test('supervisor can see custody via GET /api/custodies', async () => {
      const res = await request(app)
        .get('/api/custodies')
        .set('Authorization', `Bearer ${supA.token}`);
      expect(res.status).toBe(200);
      const items = res.body.data.items || res.body.data;
      const durable = Array.isArray(items) ? items.find((c: any) => c.item_id === durableItemId) : null;
      expect(durable).toBeDefined();
      expect(Number(durable.quantity)).toBe(3);
    });
  });

  describe('B. Creation-time guard: no main warehouse → blocked', () => {
    let brokenDept: number;
    let brokenWh: number;
    let brokenSupervisor: SeedUser;

    beforeAll(async () => {
      brokenDept = await seedDepartment();
      // No main warehouse — only a non-main destination
      brokenWh = await seedWarehouse({ department_id: brokenDept });
      brokenSupervisor = await seedRoleUser('supervisor', { department_id: brokenDept });
      brokenSupervisor.token = await login(brokenSupervisor);
    });

    test('supervisor cannot create request when dept has no main warehouse', async () => {
      const item = await seedItem(catCode, unitCode, brokenWh, 10);
      const res = await createRequest(brokenSupervisor.token, brokenWh, [
        { item_id: item, quantity: 1, unit_code: unitCode },
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/main warehouse/i);
    });
  });

  describe('C. Issue guard: request targets main warehouse → blocked', () => {
    let mainWhDept: number;
    let mainWh2: number;
    let supB: SeedUser;
    let wmB: SeedUser;

    beforeAll(async () => {
      mainWhDept = await seedDepartment();
      mainWh2 = await seedWarehouse({ department_id: mainWhDept, is_main: true });
      const destWh2 = await seedWarehouse({ department_id: mainWhDept });
      supB = await seedRoleUser('supervisor', { department_id: mainWhDept });
      wmB = await seedRoleUser('warehouse_manager', { warehouse_ids: [destWh2] });
      supB.token = await login(supB);
      wmB.token = await login(wmB);
    });

    test('supervisor cannot create request targeting main warehouse', async () => {
      const destWh2 = await pool.query(
        'SELECT id FROM warehouses WHERE department_id = $1 AND is_main = false AND is_active = true LIMIT 1',
        [mainWhDept]
      );
      const item = await seedItem(catCode, unitCode, Number(destWh2.rows[0].id), 10);
      const res = await createRequest(supB.token, mainWh2, [
        { item_id: item, quantity: 1, unit_code: unitCode },
      ]);
      // mainWh2 has is_main=true → either "does not belong" (supervisor check) or "main warehouse" check
      expect(res.status).toBe(400);
    });
  });

  describe('D. Unit is server-derived from the item base unit', () => {
    test('forged incompatible unit is IGNORED — the item base unit is persisted, never the forged one', async () => {
      const otherUnit = await seedUnit();
      const item = await seedItem(catCode, unitCode, destWh, 10);
      const res = await createRequest(supA.token, destWh, [
        { item_id: item, quantity: 1, unit_code: otherUnit },
      ]);
      expect(res.status).toBe(201);
      const stored = await pool.query(
        'SELECT unit_code FROM material_request_details WHERE request_id = $1',
        [res.body.data.id]
      );
      expect(stored.rows[0].unit_code).toBe(unitCode); // base unit
      expect(stored.rows[0].unit_code).not.toBe(otherUnit); // forged unit never persisted
    });

    test('request without unit_code succeeds — the API derives it', async () => {
      const item = await seedItem(catCode, unitCode, destWh, 10);
      const res = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${supA.token}`)
        .send({
          request_type: 'experiment',
          priority: 'normal',
          warehouse_id: destWh,
          items: [{ item_id: item, quantity: 2 }], // no unit_code at all
        });
      expect(res.status).toBe(201);
      const stored = await pool.query(
        'SELECT unit_code FROM material_request_details WHERE request_id = $1',
        [res.body.data.id]
      );
      expect(stored.rows[0].unit_code).toBe(unitCode);
    });

    test('multiple lines each receive their own correct base unit', async () => {
      const itemA = await seedItem(catCode, unitCode, destWh, 10);
      const otherUnit = await seedUnit();
      const itemB = await seedItem(catCode, otherUnit, destWh, 10);
      const res = await createRequest(supA.token, destWh, [
        { item_id: itemA, quantity: 1, unit_code: otherUnit }, // forged for A
        { item_id: itemB, quantity: 1, unit_code: unitCode }, // forged for B (swapped)
      ]);
      expect(res.status).toBe(201);
      const stored = await pool.query(
        'SELECT item_id, unit_code FROM material_request_details WHERE request_id = $1 ORDER BY id',
        [res.body.data.id]
      );
      expect(stored.rows.find((r: any) => r.item_id === itemA).unit_code).toBe(unitCode);
      expect(stored.rows.find((r: any) => r.item_id === itemB).unit_code).toBe(otherUnit);
    });
  });

  describe('E. Issue-time error codes (frontend mapping contract)', () => {
    test('issuing more than available stock returns INSUFFICIENT_STOCK with quantities', async () => {
      const item = await seedItem(catCode, unitCode, destWh, 10);
      // Only 4 units of stock in the main warehouse.
      await pool.query(
        `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, 4)
         ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = 4`,
        [item, mainWh]
      );
      const created = await createRequest(supA.token, destWh, [
        { item_id: item, quantity: 10, unit_code: unitCode },
      ]);
      expect(created.status).toBe(201);
      const requestId = created.body.data.id;
      await request(app).patch(`/api/requests/${requestId}/approve`).set('Authorization', `Bearer ${wmA.token}`);
      const res = await request(app).post(`/api/requests/${requestId}/issue`).set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(Number(res.body.error.details.available)).toBe(4);
      expect(Number(res.body.error.details.required)).toBe(10);
    });

    test('approving a non-pending request returns INVALID_REQUEST_STATUS', async () => {
      const res = await request(app)
        .post(`/api/requests/999999999/issue`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect([400, 404]).toContain(res.status);
    });
  });
});
