import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { projectsService } from '../../src/modules/projects/projects.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Supervisor request routing (032):
 *
 * Supervisor material requests now route to the warehouse manager:
 *   - pending -> wm_approved (WM approves, not DM/admin)
 *   - wm_approved -> issued (WM issues, not admin)
 *   - WM sees pending requests in their warehouse scope
 *   - Self-approval prevention still enforced for DM
 *   - Supervisor can cancel wm_approved requests
 *
 * Custody two-step return:
 *   - Supervisor requests return: active -> return_pending (no stock change)
 *   - WM receives return: return_pending -> issued (RTI created, stock restored)
 *   - Supervisor sees only their own custodies (NONE scope fix)
 */
const prefix = `${TEST_PREFIX}wmroute_`;
let app: any;

interface SeedRoleUser {
  id: number;
  username: string;
  password: string;
  token: string;
}

async function seedRoleUser(role: string, opts: { department_id?: number | null; warehouse_ids?: number[] } = {}): Promise<SeedRoleUser> {
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

async function login(user: SeedRoleUser): Promise<string> {
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

describe('Part 1: Supervisor request routing — WM approve + issue', () => {
  let admin: SeedRoleUser;
  let supA: SeedRoleUser;
  let wmA: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let whA: number;
  let itemId: number;
  let supervisorRequestId: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    const mainWhA = await seedWarehouse({ department_id: deptA, is_main: true });
    whA = await seedWarehouse({ department_id: deptA });
    itemId = await seedItem(catCode, unitCode, whA, 0);

    // Stock lives in the main warehouse; the item row is in the dest warehouse
    // for supervisor validation (items must belong to eligible dept warehouses).
    await pool.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, 100)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = 100`,
      [itemId, mainWhA]
    );

    admin = await seedRoleUser('system_admin');
    supA = await seedRoleUser('supervisor', { department_id: deptA });
    wmA = await seedRoleUser('warehouse_manager', { warehouse_ids: [whA] });

    admin.token = await login(admin);
    supA.token = await login(supA);
    wmA.token = await login(wmA);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  test('supervisor creates request -> pending', async () => {
    const res = await createRequest(supA.token, whA, [{ item_id: itemId, quantity: 5, unit_code: unitCode }]);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    supervisorRequestId = res.body.data.id;
  });

  test('WM sees supervisor pending request (warehouse scope)', async () => {
    const res = await request(app)
      .get('/api/requests')
      .set('Authorization', `Bearer ${wmA.token}`)
      .query({ limit: 100 });
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((r: any) => r.id);
    expect(ids).toContain(supervisorRequestId);
  });

  test('WM approves pending request -> wm_approved', async () => {
    const res = await request(app)
      .patch(`/api/requests/${supervisorRequestId}/approve`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('wm_approved');
  });

  test('admin cannot issue wm_approved request (wrong status for admin flow)', async () => {
    const res = await request(app)
      .post(`/api/requests/${supervisorRequestId}/issue`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  test('WM issues wm_approved request -> issued', async () => {
    const res = await request(app)
      .post(`/api/requests/${supervisorRequestId}/issue`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.transaction_id).toBeDefined();
  });

  test('DM self-approval still blocked (unchanged)', async () => {
    const dmA = await seedRoleUser('department_manager', { department_id: deptA });
    dmA.token = await login(dmA);

    // Create request via admin, then reassign to DM to simulate a DM-owned request.
    const createRes = await createRequest(admin.token, whA, [{ item_id: itemId, quantity: 2, unit_code: unitCode }]);
    expect(createRes.status).toBe(201);
    const reqId = createRes.body.data.id;
    await pool.query('UPDATE material_requests SET requested_by = $1 WHERE id = $2', [dmA.id, reqId]);

    // DM tries to approve their own request -> SELF_APPROVAL_NOT_ALLOWED.
    const approve = await request(app)
      .patch(`/api/requests/${reqId}/approve`)
      .set('Authorization', `Bearer ${dmA.token}`);
    expect(approve.status).toBe(403);
    expect(approve.body.error.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
  });

  test('supervisor can cancel wm_approved request', async () => {
    const res2 = await createRequest(supA.token, whA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
    expect(res2.status).toBe(201);
    const reqId = res2.body.data.id;

    const approveRes = await request(app)
      .patch(`/api/requests/${reqId}/approve`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('wm_approved');

    const cancelRes = await request(app)
      .patch(`/api/requests/${reqId}/cancel`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');
  });

  test('WM cannot approve already-issued request', async () => {
    const res = await request(app)
      .patch(`/api/requests/${supervisorRequestId}/approve`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(res.status).toBe(400);
  });

  test('WM cannot issue request still in pending status', async () => {
    const res2 = await createRequest(supA.token, whA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
    expect(res2.status).toBe(201);
    const reqId = res2.body.data.id;

    const issueRes = await request(app)
      .post(`/api/requests/${reqId}/issue`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(issueRes.status).toBe(400);
  });
});

describe('Part 2: Custody two-step return and supervisor scope', () => {
  let admin: SeedRoleUser;
  let supA: SeedRoleUser;
  let supB: SeedRoleUser;
  let wmA: SeedRoleUser;
  let wmB: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whA: number;
  let whB: number;
  let durableItemId: number;
  let durableItemBId: number;

  let custodySupAId: number;
  let custodySupBId: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    deptB = await seedDepartment();
    const mainWhA = await seedWarehouse({ department_id: deptA, is_main: true });
    const mainWhB = await seedWarehouse({ department_id: deptB, is_main: true });
    whA = await seedWarehouse({ department_id: deptA });
    whB = await seedWarehouse({ department_id: deptB });
    durableItemId = await seedItem(catCode, unitCode, whA, 0, { is_consumable: false });
    durableItemBId = await seedItem(catCode, unitCode, whB, 0, { is_consumable: false });

    // Stock lives in the main warehouse; items are in dest warehouses for supervisor validation.
    await pool.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, 10)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = 10`,
      [durableItemId, mainWhA]
    );
    await pool.query(
      `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, 10)
       ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = 10`,
      [durableItemBId, mainWhB]
    );

    admin = await seedRoleUser('system_admin');
    supA = await seedRoleUser('supervisor', { department_id: deptA });
    supB = await seedRoleUser('supervisor', { department_id: deptB });
    wmA = await seedRoleUser('warehouse_manager', { warehouse_ids: [whA] });
    wmB = await seedRoleUser('warehouse_manager', { warehouse_ids: [whB] });

    admin.token = await login(admin);
    supA.token = await login(supA);
    supB.token = await login(supB);
    wmA.token = await login(wmA);
    wmB.token = await login(wmB);

    // Issue a durable item to supA via admin flow so a custody is created.
    const reqA = await createRequest(supA.token, whA, [{ item_id: durableItemId, quantity: 3, unit_code: unitCode }]);
    expect(reqA.status).toBe(201);

    // WM approves supervisor request -> wm_approved -> WM issues -> issued (creates custody)
    const approveA = await request(app)
      .patch(`/api/requests/${reqA.body.data.id}/approve`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(approveA.status).toBe(200);

    const issueA = await request(app)
      .post(`/api/requests/${reqA.body.data.id}/issue`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(issueA.status).toBe(200);

    // Find the custody created for this issue
    const custA = await pool.query(
      'SELECT id FROM custodies WHERE assigned_to = $1 AND item_id = $2 AND is_active = true ORDER BY id DESC LIMIT 1',
      [supA.id, durableItemId]
    );
    custodySupAId = custA.rows[0]?.id;
    expect(custodySupAId).toBeDefined();

    // Issue to supB via whB (wmB handles it)
    const reqB = await createRequest(supB.token, whB, [{ item_id: durableItemBId, quantity: 2, unit_code: unitCode }]);
    expect(reqB.status).toBe(201);

    const approveB = await request(app)
      .patch(`/api/requests/${reqB.body.data.id}/approve`)
      .set('Authorization', `Bearer ${wmB.token}`);
    expect(approveB.status).toBe(200);

    const issueB = await request(app)
      .post(`/api/requests/${reqB.body.data.id}/issue`)
      .set('Authorization', `Bearer ${wmB.token}`);
    expect(issueB.status).toBe(200);

    const custB = await pool.query(
      'SELECT id FROM custodies WHERE assigned_to = $1 AND item_id = $2 AND is_active = true ORDER BY id DESC LIMIT 1',
      [supB.id, durableItemBId]
    );
    custodySupBId = custB.rows[0]?.id;
    expect(custodySupBId).toBeDefined();
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  test('supervisor can view own custodies', async () => {
    const res = await request(app)
      .get('/api/custodies')
      .set('Authorization', `Bearer ${supA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((c: any) => c.id);
    expect(ids).toContain(custodySupAId);
  });

  test('supervisor cannot view another user\'s custody', async () => {
    const res = await request(app)
      .get(`/api/custodies/${custodySupBId}`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(res.status).toBe(404);
  });

  test('supervisor return request -> return_pending (no stock change)', async () => {
    const before = await pool.query('SELECT current_balance FROM items WHERE id = $1', [durableItemId]);
    const balanceBefore = Number(before.rows[0].current_balance);

    const res = await request(app)
      .post(`/api/custodies/${custodySupAId}/return`)
      .set('Authorization', `Bearer ${supA.token}`)
      .send({ notes: 'returning items' });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/return request submitted/i);
    expect(res.body.data.pending_return_quantity).toBeDefined();

    // Stock should NOT have changed yet.
    const after = await pool.query('SELECT current_balance FROM items WHERE id = $1', [durableItemId]);
    const balanceAfter = Number(after.rows[0].current_balance);
    expect(balanceAfter).toBe(balanceBefore);
  });

  test('WM can receive return_pending custody and stock is restored', async () => {
    const before = await pool.query('SELECT current_balance FROM items WHERE id = $1', [durableItemId]);
    const balanceBefore = Number(before.rows[0].current_balance);

    const res = await request(app)
      .post(`/api/custodies/${custodySupAId}/receive`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.transaction_no).toBeDefined();

    const after = await pool.query('SELECT current_balance FROM items WHERE id = $1', [durableItemId]);
    const balanceAfter = Number(after.rows[0].current_balance);
    expect(balanceAfter).toBe(balanceBefore + 3);

    // Custody should now be 'returned'.
    const cust = await pool.query('SELECT status FROM custodies WHERE id = $1', [custodySupAId]);
    expect(cust.rows[0].status).toBe('returned');
  });

  test('supervisor cannot receive a custody in "active" status', async () => {
    // Create a new custody for this test.
    const req = await createRequest(supA.token, whA, [{ item_id: durableItemId, quantity: 1, unit_code: unitCode }]);
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
      [supA.id, durableItemId]
    );
    const newCustodyId = cust.rows[0].id;

    // Direct receive without return_pending -> 400.
    const receiveRes = await request(app)
      .post(`/api/custodies/${newCustodyId}/receive`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(receiveRes.status).toBe(400);
  });

  test('WM cannot receive a custody in return_pending for another warehouse', async () => {
    // supB custody is in whB which wmA does not manage.
    // First, supB requests return.
    const returnRes = await request(app)
      .post(`/api/custodies/${custodySupBId}/return`)
      .set('Authorization', `Bearer ${supB.token}`)
      .send({ notes: 'returning to wmB' });
    expect(returnRes.status).toBe(200);

    // WM of whA tries to receive -> 404 (not in scope).
    const receiveRes = await request(app)
      .post(`/api/custodies/${custodySupBId}/receive`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(receiveRes.status).toBe(404);
  });
});
