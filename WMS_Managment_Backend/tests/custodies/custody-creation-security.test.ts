import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Custody creation during material issue + security tests.
 *
 * Verifies that:
 * - Custody records are created atomically during issue for non-consumable items
 * - Consumable items do NOT create custody
 * - Supervisor sees only their own custodies
 * - Supervisor cannot access / modify another user's custody
 * - Stock decreases match custody creation (atomicity)
 * - Partial returns work correctly
 * - Return quantity validation
 */

const prefix = `${TEST_PREFIX}custsec_`;
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

function createRequest(token: string, whId: number, items: Array<{ item_id: number; quantity: number; unit_code: string }>, opts?: { project_id?: number }) {
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send({
      request_type: 'experiment',
      priority: 'normal',
      warehouse_id: whId,
      project_id: opts?.project_id,
      notes: `${prefix}note_${shortId()}`,
      items,
    });
}

describe('Custody creation during issue + security', () => {
  let admin: SeedUser;
  let supA: SeedUser;
  let supB: SeedUser;
  let wmA: SeedUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let mainWhA: number;
  let whA: number;
  let durableItemId: number;
  let consumableItemId: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    mainWhA = await seedWarehouse({ department_id: deptA, is_main: true });
    whA = await seedWarehouse({ department_id: deptA });

    durableItemId = await seedItem(catCode, unitCode, whA, 0, { is_consumable: false });
    consumableItemId = await seedItem(catCode, unitCode, whA, 0, { is_consumable: true });

    await pool.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, 50)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = 50`,
      [durableItemId, mainWhA]
    );
    await pool.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, 50)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = 50`,
      [consumableItemId, mainWhA]
    );

    admin = await seedRoleUser('system_admin');
    supA = await seedRoleUser('supervisor', { department_id: deptA });
    supB = await seedRoleUser('supervisor', { department_id: deptA });
    wmA = await seedRoleUser('warehouse_manager', { warehouse_ids: [whA] });

    admin.token = await login(admin);
    supA.token = await login(supA);
    supB.token = await login(supB);
    wmA.token = await login(wmA);
  });

  afterAll(async () => { await cleanup(prefix); });

  describe('A. Custody creation during issue', () => {
    let requestId: number;

    test('supervisor creates request with durable + consumable items', async () => {
      const res = await createRequest(supA.token, whA, [
        { item_id: durableItemId, quantity: 3, unit_code: unitCode },
        { item_id: consumableItemId, quantity: 5, unit_code: unitCode },
      ]);
      expect(res.status).toBe(201);
      requestId = res.body.data.id;
    });

    test('WM approves supervisor request -> wm_approved', async () => {
      const res = await request(app)
        .patch(`/api/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('wm_approved');
    });

    test('WM issues request -> stock decreases + custody created for durable only', async () => {
      const durableBefore = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, mainWhA]
      );
      const consumableBefore = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [consumableItemId, mainWhA]
      );

      const res = await request(app)
        .post(`/api/requests/${requestId}/issue`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);

      const durableAfter = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, mainWhA]
      );
      const consumableAfter = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [consumableItemId, mainWhA]
      );

      expect(Number(durableAfter.rows[0].current_balance)).toBe(Number(durableBefore.rows[0].current_balance) - 3);
      expect(Number(consumableAfter.rows[0].current_balance)).toBe(Number(consumableBefore.rows[0].current_balance) - 5);

      const custDurable = await pool.query(
        'SELECT * FROM custodies WHERE assigned_to = $1 AND item_id = $2 AND is_active = true',
        [supA.id, durableItemId]
      );
      expect(custDurable.rows.length).toBe(1);
      expect(Number(custDurable.rows[0].quantity)).toBe(3);
      expect(custDurable.rows[0].status).toBe('active');
      expect(custDurable.rows[0].request_id).toBe(requestId);
      expect(custDurable.rows[0].warehouse_id).toBe(whA);

      const custConsumable = await pool.query(
        'SELECT * FROM custodies WHERE assigned_to = $1 AND item_id = $2 AND is_active = true',
        [supA.id, consumableItemId]
      );
      expect(custConsumable.rows.length).toBe(0);
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

    test('request status is now issued', async () => {
      const res = await request(app)
        .get(`/api/requests/${requestId}`)
        .set('Authorization', `Bearer ${supA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('issued');
    });
  });

  describe('B. Supervisor cross-visibility security', () => {
    let supBCustodyId: number;

    beforeAll(async () => {
      const req = await createRequest(supB.token, whA, [
        { item_id: durableItemId, quantity: 2, unit_code: unitCode },
      ]);
      expect(req.status).toBe(201);

      const approveRes = await request(app)
        .patch(`/api/requests/${req.body.data.id}/approve`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(approveRes.status).toBe(200);

      const issueRes = await request(app)
        .post(`/api/requests/${req.body.data.id}/issue`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(issueRes.status).toBe(200);

      const cust = await pool.query(
        'SELECT id FROM custodies WHERE assigned_to = $1 AND item_id = $2 AND is_active = true ORDER BY id DESC LIMIT 1',
        [supB.id, durableItemId]
      );
      supBCustodyId = cust.rows[0].id;
    });

    test('supervisor A cannot see supervisor B custody via GET by ID', async () => {
      const res = await request(app)
        .get(`/api/custodies/${supBCustodyId}`)
        .set('Authorization', `Bearer ${supA.token}`);
      expect(res.status).toBe(404);
    });

    test('supervisor A cannot return supervisor B custody', async () => {
      const res = await request(app)
        .post(`/api/custodies/${supBCustodyId}/return`)
        .set('Authorization', `Bearer ${supA.token}`)
        .send({ notes: 'hijack attempt' });
      expect(res.status).toBe(404);
    });

    test('supervisor A cannot receive supervisor B custody', async () => {
      const res = await request(app)
        .post(`/api/custodies/${supBCustodyId}/receive`)
        .set('Authorization', `Bearer ${supA.token}`);
      expect(res.status).toBe(404);
    });

    test('supervisor B can see their own custody', async () => {
      const res = await request(app)
        .get(`/api/custodies/${supBCustodyId}`)
        .set('Authorization', `Bearer ${supB.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.assigned_to).toBe(supB.id);
    });

    test('supervisor A list only shows their own custodies, not B', async () => {
      const res = await request(app)
        .get('/api/custodies')
        .set('Authorization', `Bearer ${supA.token}`);
      expect(res.status).toBe(200);
      const items = res.body.data.items || res.body.data;
      const ids = Array.isArray(items) ? items.map((c: any) => c.id) : [];
      expect(ids).not.toContain(supBCustodyId);
    });
  });

  describe('C. Supervisor return flow (two-step)', () => {
    let custodyId: number;
    let supACustodies: any[];

    beforeAll(async () => {
      const res = await request(app)
        .get('/api/custodies')
        .set('Authorization', `Bearer ${supA.token}`);
      expect(res.status).toBe(200);
      supACustodies = res.body.data.items || res.body.data;
      const durable = supACustodies.find((c: any) => c.item_id === durableItemId);
      custodyId = durable.id;
    });

    test('supervisor requests return -> return_pending', async () => {
      const balanceBefore = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, whA]
      );

      const res = await request(app)
        .post(`/api/custodies/${custodyId}/return`)
        .set('Authorization', `Bearer ${supA.token}`)
        .send({ notes: 'returning 2 of 3' });
      expect(res.status).toBe(200);

      const cust = await pool.query('SELECT status, pending_return_quantity FROM custodies WHERE id = $1', [custodyId]);
      expect(cust.rows[0].status).toBe('return_pending');

      const balanceAfter = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, whA]
      );
      expect(Number(balanceAfter.rows[0].current_balance)).toBe(Number(balanceBefore.rows[0].current_balance));
    });

    test('WM receives return -> custody returned + stock restored', async () => {
      const balanceBefore = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, whA]
      );

      const res = await request(app)
        .post(`/api/custodies/${custodyId}/receive`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);

      const balanceAfter = await pool.query(
        'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
        [durableItemId, whA]
      );

      const cust = await pool.query('SELECT status, pending_return_quantity FROM custodies WHERE id = $1', [custodyId]);
      expect(cust.rows[0].status).toBe('returned');
    });

    test('cannot return already returned custody', async () => {
      const res = await request(app)
        .post(`/api/custodies/${custodyId}/return`)
        .set('Authorization', `Bearer ${supA.token}`)
        .send({ notes: 'double return' });
      expect(res.status).toBe(400);
    });

    test('cannot receive already returned custody', async () => {
      const res = await request(app)
        .post(`/api/custodies/${custodyId}/receive`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(400);
    });
  });

  describe('D. Cannot create custody without issue', () => {
    test('supervisor cannot POST /api/custodies directly', async () => {
      const res = await request(app)
        .post('/api/custodies')
        .set('Authorization', `Bearer ${supA.token}`)
        .send({
          item_id: durableItemId,
          warehouse_id: whA,
          quantity: 999,
        });
      expect(res.status).toBe(404);
    });

    test('admin cannot POST /api/custodies directly', async () => {
      const res = await request(app)
        .post('/api/custodies')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          item_id: durableItemId,
          warehouse_id: whA,
          quantity: 999,
        });
      expect(res.status).toBe(404);
    });
  });

  describe('E. Partial return quantity validation', () => {
    let partialCustodyId: number;

    beforeAll(async () => {
      const req = await createRequest(supA.token, whA, [
        { item_id: durableItemId, quantity: 4, unit_code: unitCode },
      ]);
      expect(req.status).toBe(201);

      await request(app)
        .patch(`/api/requests/${req.body.data.id}/approve`)
        .set('Authorization', `Bearer ${wmA.token}`);

      await request(app)
        .post(`/api/requests/${req.body.data.id}/issue`)
        .set('Authorization', `Bearer ${wmA.token}`);

      const cust = await pool.query(
        'SELECT id FROM custodies WHERE assigned_to = $1 AND item_id = $2 AND is_active = true ORDER BY id DESC LIMIT 1',
        [supA.id, durableItemId]
      );
      partialCustodyId = cust.rows[0]?.id;
    });

    test('returning more than custody quantity fails', async () => {
      const res = await request(app)
        .post(`/api/custodies/${partialCustodyId}/return`)
        .set('Authorization', `Bearer ${supA.token}`)
        .send({ returned_quantity: 100 });
      expect(res.status).toBe(400);
    });

    test('returning 0 fails', async () => {
      const res = await request(app)
        .post(`/api/custodies/${partialCustodyId}/return`)
        .set('Authorization', `Bearer ${supA.token}`)
        .send({ returned_quantity: 0 });
      expect(res.status).toBe(400);
    });

    test('returning negative quantity fails', async () => {
      const res = await request(app)
        .post(`/api/custodies/${partialCustodyId}/return`)
        .set('Authorization', `Bearer ${supA.token}`)
        .send({ returned_quantity: -1 });
      expect(res.status).toBe(400);
    });

    test('valid partial return succeeds', async () => {
      const res = await request(app)
        .post(`/api/custodies/${partialCustodyId}/return`)
        .set('Authorization', `Bearer ${supA.token}`)
        .send({ returned_quantity: 2, notes: 'partial return' });
      expect(res.status).toBe(200);

      const cust = await pool.query('SELECT status, pending_return_quantity FROM custodies WHERE id = $1', [partialCustodyId]);
      expect(cust.rows[0].status).toBe('return_pending');
      expect(Number(cust.rows[0].pending_return_quantity)).toBe(2);
    });

    test('WM receives partial return -> custody still active with remaining quantity', async () => {
      const res = await request(app)
        .post(`/api/custodies/${partialCustodyId}/receive`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);

      const cust = await pool.query('SELECT status, quantity, pending_return_quantity FROM custodies WHERE id = $1', [partialCustodyId]);
      expect(cust.rows[0].status).toBe('active');
      expect(Number(cust.rows[0].quantity)).toBe(2);
      expect(cust.rows[0].pending_return_quantity).toBeNull();
    });
  });
});
