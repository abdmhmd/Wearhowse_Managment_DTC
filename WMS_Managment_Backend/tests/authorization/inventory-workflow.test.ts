import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Authorization + inventory workflow tests for migrations 018 + 019.
 *
 * Rules under test:
 *   * ONLY system_admin may directly create/modify stock.
 *   * Material request state machine:
 *     pending -> dept_approved -> forwarded -> admin_approved -> issued
 *     pending / forwarded -> admin_rejected ; cancellable states per owner/admin.
 *   * department_manager approves + forwards their own department's requests;
 *     system_admin approves forwarded requests and issues stock.
 *   * Issue is atomic with a row lock preventing a double issue.
 */
const prefix = `${TEST_PREFIX}inventory_workflow_`;
let app: any;

interface SeedRoleUser {
  id: number;
  username: string;
  password: string;
  role: string;
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
  return { id, username, password, role, token: '' };
}

async function login(user: SeedRoleUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  expect(res.body.data.token).toBeDefined();
  return res.body.data.token as string;
}

async function createRequest(token: string, deptId: number, whId: number, items: Array<{ item_id: number; quantity: number; unit_code: string }>, note = 'workflow') {
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send({
      department_id: deptId,
      warehouse_id: whId,
      request_type: 'experiment',
      priority: 'normal',
      notes: `${prefix}${note}_${shortId()}`,
      items,
    });
}

/** Drives a request from 'pending' to 'admin_approved' (dept approve -> forward -> admin approve). */
async function advanceToAdminApproved(id: number, token: string) {
  const a1 = await request(app).patch(`/api/requests/${id}/approve`).set('Authorization', `Bearer ${token}`);
  expect(a1.status).toBe(200);
  const fwd = await request(app).patch(`/api/requests/${id}/forward`).set('Authorization', `Bearer ${token}`);
  expect(fwd.status).toBe(200);
  const a2 = await request(app).patch(`/api/requests/${id}/approve`).set('Authorization', `Bearer ${token}`);
  expect(a2.status).toBe(200);
}

describe('Inventory authorization workflow (migrations 018 + 019)', () => {
  let admin: SeedRoleUser;
  let whManager: SeedRoleUser;
  let wm2: SeedRoleUser;
  let deptManager: SeedRoleUser;
  let dm2: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whMainA: number;
  let whA: number;
  let whMainB: number;
  let whB: number;
  let itemWorkflow: number;
  let itemInsufficient: number;
  let itemDouble: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    deptB = await seedDepartment();
    whMainA = await seedWarehouse({ department_id: deptA, is_main: true });
    whA = await seedWarehouse({ department_id: deptA });
    whMainB = await seedWarehouse({ department_id: deptB, is_main: true });
    whB = await seedWarehouse({ department_id: deptB });
    // Stock lives centrally in the department's MAIN warehouse; requests pull
    // it down into the department warehouse (whA).
    itemWorkflow = await seedItem(catCode, unitCode, whMainA, 100);
    itemInsufficient = await seedItem(catCode, unitCode, whMainA, 100);
    itemDouble = await seedItem(catCode, unitCode, whMainA, 100);

    admin = await seedRoleUser('system_admin');
    whManager = await seedRoleUser('warehouse_manager', { warehouse_ids: [whA] });
    wm2 = await seedRoleUser('warehouse_manager', { warehouse_ids: [whB] });    deptManager = await seedRoleUser('department_manager', { department_id: deptA });
    dm2 = await seedRoleUser('department_manager', { department_id: deptB });

    admin.token = await login(admin);
    whManager.token = await login(whManager);
    wm2.token = await login(wm2);
    deptManager.token = await login(deptManager);
    dm2.token = await login(dm2);
  });

  afterAll(async () => {
    const userIds = [admin, whManager, wm2, deptManager, dm2].map((u) => u.id);

    await pool.query(
      `DELETE FROM custodies WHERE request_id IN (SELECT id FROM material_requests WHERE notes LIKE $1)`,
      [`${prefix}%`]
    );
    await pool.query(
      `DELETE FROM stock_movements USING transactions
       WHERE stock_movements.transaction_id = transactions.id AND transactions.created_by = ANY($1)`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM transaction_details USING transactions
       WHERE transaction_details.transaction_id = transactions.id AND transactions.created_by = ANY($1)`,
      [userIds]
    );
    await pool.query('DELETE FROM transactions WHERE created_by = ANY($1)', [userIds]);
    await pool.query(
      `DELETE FROM inventory_counts
       WHERE session_id IN (SELECT id FROM inventory_sessions
                            WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1))`,
      [`${prefix}%`]
    );
    await pool.query(
      `DELETE FROM inventory_sessions
       WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code LIKE $1)`,
      [`${prefix}%`]
    );
    await pool.query(
      'DELETE FROM material_request_details USING material_requests WHERE material_request_details.request_id = material_requests.id AND material_requests.notes LIKE $1',
      [`${prefix}%`]
    );
    await pool.query('DELETE FROM material_requests WHERE notes LIKE $1', [`${prefix}%`]);
    await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [userIds]);
    await cleanup(prefix);
  });

  describe('Permission matrix: direct stock modification is system_admin only', () => {
    test('warehouse_manager cannot create a transaction (403)', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${whManager.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whMainA, supplier_id: null, department_id: deptA, notes: 'authz RV' },
          details: [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    test('department_manager cannot create a transaction (403)', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${dm2.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whMainA, supplier_id: null, department_id: deptA, notes: 'authz RV' },
          details: [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(res.status).toBe(403);
    });

    test('warehouse_manager cannot approve a transaction (403)', async () => {
      const txn = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whMainA, supplier_id: null, department_id: deptA, notes: 'admin RV' },
          details: [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(txn.status).toBe(201);
      const res = await request(app)
        .post(`/api/transactions/${txn.body.data.id}/approve`)
        .set('Authorization', `Bearer ${whManager.token}`);
      expect(res.status).toBe(403);
    });

    test('system_admin can still create + approve a transaction directly', async () => {
      const before = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemWorkflow]);
      const balBefore = before.rows[0].current_balance;
      const txn = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whMainA, supplier_id: null, department_id: deptA, notes: 'admin RV' },
          details: [{ item_id: itemWorkflow, quantity: 2, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(txn.status).toBe(201);
      const approve = await request(app)
        .post(`/api/transactions/${txn.body.data.id}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(approve.status).toBe(200);
      const after = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemWorkflow]);
      expect(Number(after.rows[0].current_balance)).toBe(Number(balBefore) + 2);
    });

    test('warehouse_manager can now approve a request (wm_approved)', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      expect(r.status).toBe(201);
      const res = await request(app)
        .patch(`/api/requests/${r.body.data.id}/approve`)
        .set('Authorization', `Bearer ${whManager.token}`);
      expect(res.status).toBe(200);
    });

    test('department_manager can approve own department pending request (dept_approved)', async () => {
      // The warehouse manager requests stock for their department warehouse;
      // the department manager approves it (separation of duties forbids
      // self-approval).
      const r = await createRequest(whManager.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      expect(r.status).toBe(201);
      const id = r.body.data.id;
      const res = await request(app)
        .patch(`/api/requests/${id}/approve`)
        .set('Authorization', `Bearer ${deptManager.token}`);
      expect(res.status).toBe(200);
      const row = await request(app)
        .get(`/api/requests/${id}`)
        .set('Authorization', `Bearer ${deptManager.token}`);
      expect(row.body.data.status).toBe('dept_approved');
      expect(row.body.data.dept_approved_by).toBe(deptManager.id);
    });

    test('department_manager of another department cannot approve (404)', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      expect(r.status).toBe(201);
      const res = await request(app)
        .patch(`/api/requests/${r.body.data.id}/approve`)
        .set('Authorization', `Bearer ${dm2.token}`);
      expect(res.status).toBe(404);
    });

    test('request reject is admin-only (403 for non-admin roles)', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      for (const token of [whManager.token, deptManager.token, dm2.token]) {
        const res = await request(app)
          .patch(`/api/requests/${id}/reject`)
          .set('Authorization', `Bearer ${token}`)
          .send({ reason: 'nope' });
        expect(res.status).toBe(403);
      }
    });

    test('request issue is admin/WM-only (403 for unauthorized roles)', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      for (const token of [deptManager.token, dm2.token]) {
        const res = await request(app)
          .post(`/api/requests/${id}/issue`)
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
      }
    });

    test('inventory sessions are admin-only (403 for non-admin roles)', async () => {
      const open = await request(app)
        .post('/api/inventory/sessions')
        .set('Authorization', `Bearer ${whManager.token}`)
        .send({ warehouse_id: whA });
      expect(open.status).toBe(403);

      const view = await request(app)
        .get('/api/inventory/sessions/999999')
        .set('Authorization', `Bearer ${wm2.token}`);
      expect(view.status).toBe(403);

      const count = await request(app)
        .post('/api/inventory/sessions/999999/count')
        .set('Authorization', `Bearer ${dm2.token}`)
        .send({ item_id: itemWorkflow, counted_qty: 5 });
      expect(count.status).toBe(403);

      const close = await request(app)
        .post('/api/inventory/sessions/999999/close')
        .set('Authorization', `Bearer ${whManager.token}`);
      expect(close.status).toBe(403);
    });

    test('system_admin can open an inventory session (smoke test)', async () => {
      const res = await request(app)
        .post('/api/inventory/sessions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ warehouse_id: whA, notes: `${prefix}session` });
      expect(res.status).toBe(201);
      expect(res.body.data.session_no).toBeDefined();
    });

    test('warehouse_manager cannot create item master data (403)', async () => {
      const res = await request(app)
        .post('/api/items')
        .set('Authorization', `Bearer ${whManager.token}`)
        .send({
          item_code: `${prefix}item_wm_${shortId()}`,
          name_ar: 'WM item',
          category_code: catCode,
          unit_code: unitCode,
          warehouse_id: whA,
          current_balance: 0,
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    test('warehouse_manager cannot modify an item balance via update (403)', async () => {
      const created = await request(app)
        .post('/api/items')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          item_code: `${prefix}item_upd_${shortId()}`,
          name_ar: 'update target',
          category_code: catCode,
          unit_code: unitCode,
          warehouse_id: whA,
          current_balance: 10,
        });
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const res = await request(app)
        .put(`/api/items/${id}`)
        .set('Authorization', `Bearer ${whManager.token}`)
        .send({ current_balance: 999 });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });
  });

  describe('Full workflow: request -> dept approve -> forward -> admin approve -> issue', () => {
    test('end-to-end happy path with stock movement and audit trail', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 3, unit_code: unitCode }]);
      expect(r.status).toBe(201);
      const reqId = r.body.data.id;
      expect(r.body.data.status).toBe('pending');

      const auditCreated = await pool.query(
        `SELECT 1 FROM audit_logs WHERE action = 'REQUEST_CREATED' AND resource_id = $1`,
        [String(reqId)]
      );
      expect(auditCreated.rows.length).toBe(1);

      // pending -> dept_approved
      const approve1 = await request(app)
        .patch(`/api/requests/${reqId}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(approve1.status).toBe(200);
      const afterDept = await request(app)
        .get(`/api/requests/${reqId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(afterDept.body.data.status).toBe('dept_approved');
      expect(afterDept.body.data.dept_approved_by).toBe(admin.id);

      // dept_approved -> forwarded
      const forward = await request(app)
        .patch(`/api/requests/${reqId}/forward`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(forward.status).toBe(200);
      const afterForward = await request(app)
        .get(`/api/requests/${reqId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(afterForward.body.data.status).toBe('forwarded');
      expect(afterForward.body.data.forwarded_by).toBe(admin.id);

      // forwarded -> admin_approved
      const approve2 = await request(app)
        .patch(`/api/requests/${reqId}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(approve2.status).toBe(200);
      const afterApprove = await request(app)
        .get(`/api/requests/${reqId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(afterApprove.body.data.status).toBe('admin_approved');
      expect(afterApprove.body.data.approved_by).toBe(admin.id);

      const before = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemWorkflow]);

      // admin_approved -> issued
      const issue = await request(app)
        .post(`/api/requests/${reqId}/issue`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(issue.status).toBe(200);
      expect(issue.body.data.transaction_id).toBeDefined();
      const txnId = issue.body.data.transaction_id;

      const after = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemWorkflow]);
      expect(Number(after.rows[0].current_balance)).toBe(Number(before.rows[0].current_balance) - 3);

      const movements = await pool.query(
        'SELECT COUNT(*)::int AS n FROM stock_movements WHERE transaction_id = $1',
        [txnId]
      );
      // Issue records BOTH legs: OUT of the main warehouse and IN to the
      // department warehouse.
      expect(movements.rows[0].n).toBe(2);

      const requestRow = await pool.query(
        'SELECT status, transaction_id, issued_by FROM material_requests WHERE id = $1',
        [reqId]
      );
      expect(requestRow.rows[0].status).toBe('issued');
      expect(requestRow.rows[0].transaction_id).toBe(txnId);
      expect(requestRow.rows[0].issued_by).toBe(admin.id);

      for (const action of ['REQUEST_APPROVED', 'REQUEST_FORWARDED', 'REQUEST_ISSUED']) {
        const audit = await pool.query(
          `SELECT 1 FROM audit_logs WHERE action = $1 AND resource_id = $2 LIMIT 1`,
          [action, String(reqId)]
        );
        expect(audit.rows.length).toBe(1);
      }
    });
  });

  describe('State machine enforcement', () => {
    test('cannot approve a rejected request', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      await request(app)
        .patch(`/api/requests/${id}/reject`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ reason: 'no stock' });
      const res = await request(app)
        .patch(`/api/requests/${id}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(400);
    });

    test('cannot issue a pending request (must be admin_approved first)', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      const res = await request(app)
        .post(`/api/requests/${id}/issue`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST_STATUS');
    });

    test('cannot cancel an issued request', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      await advanceToAdminApproved(id, admin.token);
      await request(app)
        .post(`/api/requests/${id}/issue`)
        .set('Authorization', `Bearer ${admin.token}`);
      const res = await request(app)
        .patch(`/api/requests/${id}/cancel`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(400);
    });

    test('cannot approve an already-approved request', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      await request(app)
        .patch(`/api/requests/${id}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      const res = await request(app)
        .patch(`/api/requests/${id}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(400);
    });

    test('cannot forward a request that is not dept_approved', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      const res = await request(app)
        .patch(`/api/requests/${id}/forward`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(400);
    });

    test('cannot issue an already-issued request', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      await advanceToAdminApproved(id, admin.token);
      await request(app)
        .post(`/api/requests/${id}/issue`)
        .set('Authorization', `Bearer ${admin.token}`);
      const res = await request(app)
        .post(`/api/requests/${id}/issue`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Double-issue concurrency (row lock)', () => {
    test('concurrent issue requests: exactly one wins, no double stock decrement', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemDouble, quantity: 1, unit_code: unitCode }]);
      expect(r.status).toBe(201);
      const id = r.body.data.id;
      await advanceToAdminApproved(id, admin.token);

      const before = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemDouble]);

      const [r1, r2] = await Promise.all([
        request(app).post(`/api/requests/${id}/issue`).set('Authorization', `Bearer ${admin.token}`),
        request(app).post(`/api/requests/${id}/issue`).set('Authorization', `Bearer ${admin.token}`),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 400]);

      const after = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemDouble]);
      expect(Number(after.rows[0].current_balance)).toBe(Number(before.rows[0].current_balance) - 1);

      const requestRow = await pool.query(
        'SELECT status, transaction_id FROM material_requests WHERE id = $1',
        [id]
      );
      expect(requestRow.rows[0].status).toBe('issued');
      expect(requestRow.rows[0].transaction_id).not.toBeNull();
    });
  });

  describe('Insufficient stock', () => {
    test('issue fails atomically and leaves the request admin_approved', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemInsufficient, quantity: 500, unit_code: unitCode }]);
      const id = r.body.data.id;
      await advanceToAdminApproved(id, admin.token);

      const before = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemInsufficient]);

      const issue = await request(app)
        .post(`/api/requests/${id}/issue`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(issue.status).toBe(400);

      const after = await pool.query('SELECT current_balance FROM items WHERE id = $1', [itemInsufficient]);
      expect(after.rows[0].current_balance).toBe(before.rows[0].current_balance);

      const requestRow = await pool.query(
        'SELECT status, transaction_id, request_no FROM material_requests WHERE id = $1',
        [id]
      );
      expect(requestRow.rows[0].status).toBe('admin_approved');
      expect(requestRow.rows[0].transaction_id).toBeNull();

      const lnTxns = await pool.query(
        'SELECT COUNT(*)::int AS n FROM transactions WHERE notes = $1',
        [`Auto-generated from Request ${requestRow.rows[0].request_no}`]
      );
      expect(lnTxns.rows[0].n).toBe(0);
    });
  });

  describe('Cancel ownership', () => {
    test('department_manager cannot cancel someone elses request (403)', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      const res = await request(app)
        .patch(`/api/requests/${id}/cancel`)
        .set('Authorization', `Bearer ${deptManager.token}`);
      expect(res.status).toBe(403);
    });

    test('warehouse_manager can cancel their own pending request', async () => {
      const r = await createRequest(whManager.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      const res = await request(app)
        .patch(`/api/requests/${id}/cancel`)
        .set('Authorization', `Bearer ${whManager.token}`);
      expect(res.status).toBe(200);
      const row = await pool.query('SELECT status FROM material_requests WHERE id = $1', [id]);
      expect(row.rows[0].status).toBe('cancelled');
    });
  });

  describe('Request scoping', () => {
    test('warehouse_manager payload warehouse is ignored; the assigned warehouse is used (201)', async () => {
      // A WM has one warehouse assignment. A spoofed/conflicting warehouse_id in
      // the payload must NOT escalate: the request is created against the
      // auto-derived assigned warehouse instead.
      const res = await createRequest(whManager.token, deptA, whB, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      expect(res.status).toBe(201);
      expect(res.body.data.warehouse_id).toBe(whA);
      expect(res.body.data.department_id).toBe(deptA);
    });

    test('department_manager cannot create a material request (403 AUTH_FORBIDDEN)', async () => {
      const res = await createRequest(deptManager.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    test('warehouse_manager can view their own request', async () => {
      const r = await createRequest(whManager.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      expect(r.status).toBe(201);
      const id = r.body.data.id;

      const res = await request(app)
        .get(`/api/requests/${id}`)
        .set('Authorization', `Bearer ${whManager.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
    });

    test('another warehouse_manager cannot view that request (404)', async () => {
      const r = await createRequest(whManager.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      const id = r.body.data.id;
      const res = await request(app)
        .get(`/api/requests/${id}`)
        .set('Authorization', `Bearer ${wm2.token}`);
      expect(res.status).toBe(404);
    });

    test('warehouse_manager only lists requests for assigned warehouses', async () => {
      const rA = await createRequest(admin.token, deptA, whA, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      expect(rA.status).toBe(201);
      const rB = await createRequest(admin.token, deptB, whB, [{ item_id: itemWorkflow, quantity: 1, unit_code: unitCode }]);
      expect(rB.status).toBe(201);

      const res = await request(app)
        .get('/api/requests')
        .set('Authorization', `Bearer ${whManager.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((x: any) => x.id);
      expect(ids).toContain(rA.body.data.id);
      expect(ids).not.toContain(rB.body.data.id);
    });
  });
});
