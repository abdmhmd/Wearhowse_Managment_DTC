import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedDepartment, seedWarehouse, seedItem, cleanup } from '../helpers';
import {
  PO_TEST_PREFIX,
  seedPoWorld,
  apiCreatePo,
  seedStock,
  getStock,
} from '../purchase-orders/helpers';

/**
 * Phase 2 behavior tests (D3/D4/D9/D11/D13/D15). Every fixed behavior ships
 * with a behavioral proof that runs against the randomized CI database:
 *
 *   D4  — issue requests NEVER reach the system administrator. The admin holds
 *         zero `requests:*` permissions after migration 039, and the full
 *         request lifecycle (create → wm_approved → issued) completes with only
 *         a sub-warehouse manager involved.
 *   D13 — a sub-warehouse manager rejects a pending request → wm_rejected with
 *         rejected_by + rejection_reason. Approved requests conflict (409); a
 *         wm_rejected request can never be issued; other roles lack the reject
 *         permission entirely.
 *   D11 — department_manager scope is blind to the department's MAIN warehouse
 *         (transactions list + single-row access) while sub-warehouse rows of
 *         the same department remain visible.
 *   D3  — custody return is bilateral: the supervisor initiates a
 *         return_pending request and the sub-warehouse manager confirms it.
 *         The system administrator can never initiate a return (no
 *         custodies:return).
 *   D15 — the sub-warehouse manager evaluates the returned material's
 *         condition during confirmation: 'good' restores stock via RTI;
 *         'damaged' preserves the record with NO stock restored.
 *   D9  — purchase-order movements are two-party confirmed: the user who
 *         executed a transfer (or created the PO and confirmed receive) can
 *         never confirm their own step.
 */
const prefix = `${TEST_PREFIX}phase2_`;
let app: any;

interface SeedRoleUser {
  id: number;
  username: string;
  password: string;
  token: string;
}

async function seedRoleUser(
  role: string,
  opts: { department_id?: number | null; warehouse_ids?: number[] } = {}
): Promise<SeedRoleUser> {
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

async function seedStockInMain(itemId: number, mainWhId: number, balance: number): Promise<void> {
  await pool.query(
    `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, $3)
     ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = $3`,
    [itemId, mainWhId, balance]
  );
}

async function issueToSupervisor(supToken: string, whId: number, itemId: number, qty: number, unitCode: string, subWmToken: string, supUsername: string): Promise<number> {
  const req = await createRequest(supToken, whId, [{ item_id: itemId, quantity: qty, unit_code: unitCode }]);
  expect(req.status).toBe(201);
  const reqId = req.body.data.id;

  const approve = await request(app)
    .patch(`/api/requests/${reqId}/approve`)
    .set('Authorization', `Bearer ${subWmToken}`);
  expect(approve.status).toBe(200);
  expect(approve.body.data.status).toBe('wm_approved');

  const issue = await request(app)
    .post(`/api/requests/${reqId}/issue`)
    .set('Authorization', `Bearer ${subWmToken}`);
  expect(issue.status).toBe(200);

  const cust = await pool.query(
    'SELECT id FROM custodies WHERE item_id = $1 AND assigned_to = (SELECT id FROM users WHERE username = $2) AND is_active = true ORDER BY id DESC LIMIT 1',
    [itemId, supUsername]
  );
  const custodyId = cust.rows[0]?.id;
  expect(custodyId).toBeDefined();
  return custodyId as number;
}

// ── Shared fixture: one world, one set of users, one login round ───────────
let admin: SeedRoleUser;
let supA: SeedRoleUser;
let subWM: SeedRoleUser;
let dmA: SeedRoleUser;

let poWorld: Awaited<ReturnType<typeof seedPoWorld>>;

let catCode: string;
let unitCode: string;
let deptA: number;
let mainWhA: number;
let subWhA: number;
let itemId: number;
let durableItemId: number;

let txnMain: number;
let txnSub: number;

let custodyGood: number;
let custodyDamaged: number;

async function itemBalance(): Promise<number> {
  const res = await pool.query('SELECT current_balance FROM items WHERE id = $1', [durableItemId]);
  return Number(res.rows[0].current_balance);
}

beforeAll(async () => {
  app = (await import('../../src/app')).default;

  catCode = await seedCategory();
  unitCode = await seedUnit();
  deptA = await seedDepartment();
  mainWhA = await seedWarehouse({ department_id: deptA, is_main: true });
  subWhA = await seedWarehouse({ department_id: deptA });
  itemId = await seedItem(catCode, unitCode, subWhA, 0);
  durableItemId = await seedItem(catCode, unitCode, subWhA, 0, { is_consumable: false });
  await seedStockInMain(itemId, mainWhA, 100);
  await seedStockInMain(durableItemId, mainWhA, 10);

  // PO world for the D9 suite (mainWhA/purchase-order variants live here so
  // their statuses are independent of the MR/main-warehouse tests above).
  poWorld = await seedPoWorld();
  await seedStock(poWorld.itemId, poWorld.mainWhA, 200);

  admin = await seedRoleUser('admin');
  supA = await seedRoleUser('supervisor', { department_id: deptA });
  subWM = await seedRoleUser('sub_warehouse_manager', {
    warehouse_ids: [subWhA, poWorld.mainWhA, poWorld.subWhA1],
  });
  dmA = await seedRoleUser('department_manager', { department_id: deptA });

  admin.token = await login(admin);
  supA.token = await login(supA);
  subWM.token = await login(subWM);
  dmA.token = await login(dmA);

  // D11 fixtures: one transaction in the MAIN warehouse, one in a SUB warehouse.
  const txnMainRes = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      header: { type: 'RV', warehouse_id: mainWhA, department_id: deptA, notes: `${prefix}d11 main` },
      details: [{ item_id: itemId, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
    });
  expect(txnMainRes.status).toBe(201);
  txnMain = txnMainRes.body.data.id;

  const txnSubRes = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      header: { type: 'RV', warehouse_id: subWhA, department_id: deptA, notes: `${prefix}d11 sub` },
      details: [{ item_id: itemId, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
    });
  expect(txnSubRes.status).toBe(201);
  txnSub = txnSubRes.body.data.id;

  // D3/D15 fixtures: two active custodies (durable item issued to the supervisor).
  custodyGood = await issueToSupervisor(supA.token, subWhA, durableItemId, 3, unitCode, subWM.token, supA.username);
  custodyDamaged = await issueToSupervisor(supA.token, subWhA, durableItemId, 2, unitCode, subWM.token, supA.username);
});

afterAll(async () => {
  await cleanup(prefix);
  await cleanup(PO_TEST_PREFIX);
});

describe('Part 1 — D4/D13: issue requests never reach admin; Sub-WM rejects', () => {
  test('D4: admin cannot list material requests (no requests:view)', async () => {
    const res = await request(app)
      .get('/api/requests')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
  });

  test('D4: admin cannot create a material request (no requests:create)', async () => {
    const res = await createRequest(admin.token, subWhA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(403);
  });

  test('D4: admin cannot approve a pending request (no requests:approve)', async () => {
    const created = await createRequest(supA.token, subWhA, [{ item_id: itemId, quantity: 2, unit_code: unitCode }]);
    expect(created.status).toBe(201);
    const reqId = created.body.data.id;

    const res = await request(app)
      .patch(`/api/requests/${reqId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
  });

  test('D4: admin cannot issue a request (no requests:issue)', async () => {
    const created = await createRequest(supA.token, subWhA, [{ item_id: itemId, quantity: 2, unit_code: unitCode }]);
    expect(created.status).toBe(201);
    const reqId = created.body.data.id;

    const res = await request(app)
      .post(`/api/requests/${reqId}/issue`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
  });

  test('D4: Sub-WM completes the whole lifecycle without any admin step', async () => {
    const beforeMain = await getStock(itemId, mainWhA);

    const created = await createRequest(subWM.token, subWhA, [{ item_id: itemId, quantity: 5, unit_code: unitCode }]);
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('pending');
    const reqId = created.body.data.id;

    const approve = await request(app)
      .patch(`/api/requests/${reqId}/approve`)
      .set('Authorization', `Bearer ${subWM.token}`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('wm_approved');

    const issue = await request(app)
      .post(`/api/requests/${reqId}/issue`)
      .set('Authorization', `Bearer ${subWM.token}`);
    expect(issue.status).toBe(200);
    expect(issue.body.data.transaction_id).toBeDefined();

    expect(await getStock(itemId, mainWhA)).toBe(beforeMain - 5);
  });

  test('D13: Sub-WM rejects a pending request into wm_rejected with reason', async () => {
    const created = await createRequest(supA.token, subWhA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
    expect(created.status).toBe(201);
    const reqId = created.body.data.id;

    const res = await request(app)
      .patch(`/api/requests/${reqId}/reject`)
      .set('Authorization', `Bearer ${subWM.token}`)
      .send({ reason: 'phase2 rejection because stock is not available' });
    expect(res.status).toBe(200);

    const row = (await pool.query(
      'SELECT status, rejected_by, rejection_reason FROM material_requests WHERE id = $1',
      [reqId]
    )).rows[0];
    expect(row.status).toBe('wm_rejected');
    expect(row.rejected_by).toBe(subWM.id);
    expect(row.rejection_reason).toBe('phase2 rejection because stock is not available');
  });

  test('D13: an approved request can never be rejected (409 conflict)', async () => {
    const created = await createRequest(supA.token, subWhA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
    expect(created.status).toBe(201);
    const reqId = created.body.data.id;

    const approve = await request(app)
      .patch(`/api/requests/${reqId}/approve`)
      .set('Authorization', `Bearer ${subWM.token}`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('wm_approved');

    const res = await request(app)
      .patch(`/api/requests/${reqId}/reject`)
      .set('Authorization', `Bearer ${subWM.token}`)
      .send({ reason: 'too late to reject' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_ALREADY_APPROVED');
  });

  test('D13: a wm_rejected request can never be issued', async () => {
    const created = await createRequest(supA.token, subWhA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
    expect(created.status).toBe(201);
    const reqId = created.body.data.id;

    const reject = await request(app)
      .patch(`/api/requests/${reqId}/reject`)
      .set('Authorization', `Bearer ${subWM.token}`)
      .send({ reason: 'rejected before issuance' });
    expect(reject.status).toBe(200);

    const issue = await request(app)
      .post(`/api/requests/${reqId}/issue`)
      .set('Authorization', `Bearer ${subWM.token}`);
    expect(issue.status).toBe(400);
    expect(issue.body.error.code).toBe('INVALID_REQUEST_STATUS');
  });

  test('D13: department_manager cannot reject a request (no requests:reject)', async () => {
    const created = await createRequest(supA.token, subWhA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
    expect(created.status).toBe(201);
    const reqId = created.body.data.id;

    const res = await request(app)
      .patch(`/api/requests/${reqId}/reject`)
      .set('Authorization', `Bearer ${dmA.token}`)
      .send({ reason: 'not my job' });
    expect(res.status).toBe(403);
  });
});

describe('Part 2 — D11: department_manager scope excludes the main warehouse', () => {
  test('D11: DM list contains the sub-warehouse transaction but never the main', async () => {
    const res = await request(app)
      .get('/api/transactions?page=1&limit=100')
      .set('Authorization', `Bearer ${dmA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((t: any) => t.id);
    expect(ids).toContain(txnSub);
    expect(ids).not.toContain(txnMain);
  });

  test('D11: DM can open the sub-warehouse transaction, main is a 404', async () => {
    const subRes = await request(app)
      .get(`/api/transactions/${txnSub}`)
      .set('Authorization', `Bearer ${dmA.token}`);
    expect(subRes.status).toBe(200);

    const mainRes = await request(app)
      .get(`/api/transactions/${txnMain}`)
      .set('Authorization', `Bearer ${dmA.token}`);
    expect(mainRes.status).toBe(404);
  });
});

describe('Part 3 — D3/D15: custody return is bilateral and the Sub-WM sets the condition', () => {
  test('D3: admin cannot initiate a custody return (no custodies:return)', async () => {
    const res = await request(app)
      .post(`/api/custodies/${custodyGood}/return`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ notes: 'admin-initiated return is impossible' });
    expect(res.status).toBe(403);
  });

  test('D3+D15: supervisor requests return, Sub-WM confirms good and stock is restored', async () => {
    const before = await itemBalance();

    const ret = await request(app)
      .post(`/api/custodies/${custodyGood}/return`)
      .set('Authorization', `Bearer ${supA.token}`)
      .send({ notes: 'please receive these' });
    expect(ret.status).toBe(200);
    expect(ret.body.data.message).toMatch(/return request submitted/i);
    expect(ret.body.data.pending_return_quantity).toBe(3);

    const during = await itemBalance();
    expect(during).toBe(before);

    const receive = await request(app)
      .post(`/api/custodies/${custodyGood}/receive`)
      .set('Authorization', `Bearer ${subWM.token}`);
    expect(receive.status).toBe(200);
    expect(receive.body.data.transaction_no).toBeDefined();

    expect(await itemBalance()).toBe(before + 3);
    const cust = (await pool.query('SELECT status FROM custodies WHERE id = $1', [custodyGood])).rows[0];
    expect(cust.status).toBe('returned');
  });

  test('D15: supervisor cannot confirm, Sub-WM confirms damaged and NO stock returns', async () => {
    const before = await itemBalance();

    const ret = await request(app)
      .post(`/api/custodies/${custodyDamaged}/return`)
      .set('Authorization', `Bearer ${supA.token}`)
      .send({ notes: 'this one is damaged' });
    expect(ret.status).toBe(200);

    const supervisorConfirm = await request(app)
      .post(`/api/custodies/${custodyDamaged}/receive`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(supervisorConfirm.status).toBe(403);

    const receive = await request(app)
      .post(`/api/custodies/${custodyDamaged}/receive`)
      .set('Authorization', `Bearer ${subWM.token}`)
      .send({ condition: 'damaged' });
    expect(receive.status).toBe(200);
    expect(receive.body.data.status).toBe('damaged');

    expect(await itemBalance()).toBe(before);
    const cust = (await pool.query('SELECT status, condition FROM custodies WHERE id = $1', [custodyDamaged])).rows[0];
    expect(cust.status).toBe('damaged');
    expect(cust.condition).toBe('damaged');
  });
});

describe('Part 4 — D9: two-party confirmation on purchase orders', () => {
  test('D9: the PO creator can never confirm their own receive (another user must)', async () => {
    const created = await apiCreatePo(app, admin.token, {
      supplier_name: poWorld.supplierName,
      warehouse_id: poWorld.mainWhA,
      lines: [{ item_id: poWorld.itemId, quantity_ordered: 4, unit_code: poWorld.unitCode, unit_price: 3 }],
    });
    expect(created.status).toBe(201);
    const poId = created.body.data.id;
    const detailId = created.body.data.details[0].id;

    const approved = await request(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(approved.status).toBe(200);

    const received = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${subWM.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 4 }] });
    expect(received.status).toBe(200);
    expect(received.body.data.status).toBe('received');

    const selfConfirm = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-receive`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(selfConfirm.status).toBe(403);

    const otherConfirm = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-receive`)
      .set('Authorization', `Bearer ${subWM.token}`);
    expect(otherConfirm.status).toBe(200);

    const row = (await pool.query('SELECT receive_confirmed_by FROM purchase_orders WHERE id = $1', [poId])).rows[0];
    expect(row.receive_confirmed_by).toBe(subWM.id);
  });

  test('D9: the transfer executor can never confirm their own transfer', async () => {
    // D8 flow: a department sub-warehouse manager raises a Purchase Request;
    // dept + admin approvals auto-create the PO; receiving it drafts a
    // Transfer to the creator's sub-warehouse; a DIFFERENT user must confirm.
    const primWM = await seedRoleUser('sub_warehouse_manager', {
      department_id: poWorld.deptA,
      warehouse_ids: [poWorld.mainWhA, poWorld.subWhA1],
    });
    primWM.token = await login(primWM);
    poWorld.users.deptMgr.token = await login(poWorld.users.deptMgr);

    const pr = await request(app)
      .post('/api/purchase-requests')
      .set('Authorization', `Bearer ${primWM.token}`)
      .send({
        warehouse_id: poWorld.mainWhA,
        items: [{ item_id: poWorld.itemId, quantity: 50, unit_code: poWorld.unitCode }],
      });
    expect(pr.status).toBe(201);
    const requestId = pr.body.data.id;

    const deptOk = await request(app)
      .patch(`/api/purchase-requests/${requestId}/approve-dept`)
      .set('Authorization', `Bearer ${poWorld.users.deptMgr.token}`);
    expect(deptOk.status).toBe(200);

    const adminOk = await request(app)
      .patch(`/api/purchase-requests/${requestId}/approve-admin`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminOk.status).toBe(200);
    const poId = adminOk.body.data.purchase_order_id;
    expect(poId).toBeDefined();

    const po = (await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${admin.token}`)).body.data;
    expect(po.purchase_request_id).toBe(requestId);
    const detailId = po.details[0].id;

    const approved = await request(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set('Authorization', `Bearer ${subWM.token}`);
    expect(approved.status).toBe(200);

    const srcBefore = await getStock(poWorld.itemId, poWorld.mainWhA);
    const dstBefore = await getStock(poWorld.itemId, poWorld.subWhA1);

    const received = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${subWM.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 50 }] });
    expect(received.status).toBe(200);
    expect(received.body.data.status).toBe('received');
    expect(received.body.data.auto_transfer_created).toBe(true);
    expect(received.body.data.linked_transfer_destination_warehouse_id).toBe(poWorld.subWhA1);

    // The executor who drafted the transfer cannot confirm their own movement.
    const selfConfirm = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-transfer`)
      .set('Authorization', `Bearer ${subWM.token}`);
    expect(selfConfirm.status).toBe(403);

    // Confirming by a DIFFERENT user realises the movement main -> sub.
    const otherConfirm = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-transfer`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(otherConfirm.status).toBe(200);
    expect(otherConfirm.body.data.status).toBe('approved');
    expect(otherConfirm.body.data.transfer_count).toBe(1);

    expect(await getStock(poWorld.itemId, poWorld.mainWhA)).toBe(srcBefore);
    expect(await getStock(poWorld.itemId, poWorld.subWhA1)).toBe(dstBefore + 50);
  });
});