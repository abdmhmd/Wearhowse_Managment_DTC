import request from 'supertest';
import { pool, runInTransaction } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { loadAuthContext } from '../../src/modules/authorization/authorization.service';
import { materialRequestsService } from '../../src/modules/material-requests/material-requests.service';
import { materialRequestsRepository } from '../../src/modules/material-requests/material-requests.repository';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * SELF-APPROVAL PREVENTION FOR DEPARTMENT MANAGERS
 *
 * A department_manager MUST NOT approve a material request they created
 * themselves. The constraint is enforced in the service (backend), NOT only by
 * hiding the button in the UI:
 *
 *   A. dm owns a request -> dm tries to approve own -> 403 SELF_APPROVAL_NOT_ALLOWED
 *   B. dm approves another user's request in the same department -> succeeds
 *   C. dm cannot approve a request from another department -> 404
 *   D. admin behavior remains unchanged
 *   E. sub_warehouse_manager behavior remains unchanged (403 AUTH_FORBIDDEN)
 *   F. direct service/API call bypassing routes is still rejected (403)
 *   G. department_manager can no longer CREATE requests (route 403 AUTH_FORBIDDEN)
 *   H. direct service call to createRequest is rejected for department_manager
 *
 * Since a department_manager can no longer create requests, tests that need a
 * dm-owned request insert the row directly (simulating a legacy/backfilled
 * request) so the self-approval rule is exercised server-side.
 */
const prefix = `${TEST_PREFIX}selfapproval_`;
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

function createRequest(token: string, deptId: number, whId: number, items: Array<{ item_id: number; quantity: number; unit_code: string }>) {
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send({
      department_id: deptId,
      warehouse_id: whId,
      request_type: 'experiment',
      priority: 'normal',
      notes: `${prefix}note_${shortId()}`,
      items,
    });
}

/**
 * Inserts a pending material request row owned by a specific user (used to
 * fabricate a department_manager-owned request, which can no longer be created
 * through the API after the rule change).
 */
async function insertOwnedRequest(opts: {
  requestedBy: number;
  deptId: number;
  whId: number;
  itemId: number;
  unitCode: string;
}) {
  return runInTransaction(async (client) => {
    const request_no = await materialRequestsRepository.generateRequestNo();
    const header = await materialRequestsRepository.create(client, {
      request_no,
      department_id: opts.deptId,
      warehouse_id: opts.whId,
      requested_by: opts.requestedBy,
      status: 'pending',
      priority: 'normal',
      request_type: 'experiment',
      project_id: null,
      needed_by: null,
      notes: `${prefix}sql_${shortId()}`,
    });
    await materialRequestsRepository.createDetail(client, {
      request_id: header.id,
      item_id: opts.itemId,
      quantity: 1,
      unit_code: opts.unitCode,
    });
    return header;
  });
}

describe('Self-approval prevention for department managers', () => {
  let admin: SeedRoleUser;
  let dmA: SeedRoleUser;
  let dmB: SeedRoleUser;
  let wmA: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whA: number;
  let whB: number;
  let itemId: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    deptB = await seedDepartment();
    await seedWarehouse({ department_id: deptA, is_main: true });
    await seedWarehouse({ department_id: deptB, is_main: true });
    whA = await seedWarehouse({ department_id: deptA });
    whB = await seedWarehouse({ department_id: deptB });
    itemId = await seedItem(catCode, unitCode, whA, 100);

    admin = await seedRoleUser('admin');
    dmA = await seedRoleUser('department_manager', { department_id: deptA });
    dmB = await seedRoleUser('department_manager', { department_id: deptB });
    wmA = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whA] });

    admin.token = await login(admin);
    dmA.token = await login(dmA);
    dmB.token = await login(dmB);
    wmA.token = await login(wmA);
  });

  afterAll(async () => {
    const userIds = [admin, dmA, dmB, wmA].map((u) => u.id);
    await pool.query(
      'DELETE FROM material_request_details USING material_requests WHERE material_request_details.request_id = material_requests.id AND material_requests.notes LIKE $1',
      [`${prefix}%`]
    );
    await pool.query('DELETE FROM material_requests WHERE notes LIKE $1', [`${prefix}%`]);
    await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [userIds]);
    await cleanup(prefix);
  });

  describe('Backend enforcement (service + API)', () => {
    test('A: department_manager cannot approve their own request via API (403 SELF_APPROVAL_NOT_ALLOWED)', async () => {
      const owned = await insertOwnedRequest({ requestedBy: dmA.id, deptId: deptA, whId: whA, itemId, unitCode });
      const id = owned.id;

      const res = await request(app)
        .patch(`/api/requests/${id}/approve`)
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
      expect(res.body.error.message).toBe('A department manager cannot approve a request they created themselves.');

      const row = await pool.query('SELECT status FROM material_requests WHERE id = $1', [id]);
      expect(row.rows[0].status).toBe('pending');
    });

    test('F: direct service call bypassing the route layer is rejected too (403 SELF_APPROVAL_NOT_ALLOWED)', async () => {
      const owned = await insertOwnedRequest({ requestedBy: dmA.id, deptId: deptA, whId: whA, itemId, unitCode });
      const id = owned.id;

      const ctx = await loadAuthContext(dmA.id);
      expect(ctx).not.toBeNull();
      expect(ctx!.permissions).toContain('requests:approve');

      await expect(
        materialRequestsService.approveRequest(id, dmA.id, ctx!)
      ).rejects.toMatchObject({ status: 403, code: 'SELF_APPROVAL_NOT_ALLOWED' });

      const row = await pool.query('SELECT status FROM material_requests WHERE id = $1', [id]);
      expect(row.rows[0].status).toBe('pending');
    });

    test('B: department_manager approves another user request in the same department (200 dept_approved)', async () => {
      const r = await createRequest(wmA.token, deptA, whA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
      expect(r.status).toBe(201);
      const id = r.body.data.id;

      const res = await request(app)
        .patch(`/api/requests/${id}/approve`)
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('dept_approved');
      expect(res.body.data.dept_approved_by).toBe(dmA.id);
    });

    test('C: department_manager cannot approve a request from another department (404)', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
      expect(r.status).toBe(201);
      const id = r.body.data.id;

      const res = await request(app)
        .patch(`/api/requests/${id}/approve`)
        .set('Authorization', `Bearer ${dmB.token}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('REQUEST_NOT_FOUND');
    });

    test('D: admin approval behavior remains unchanged', async () => {
      // Admin can approve a pending request (dept approval step)...
      const r1 = await createRequest(admin.token, deptA, whA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
      expect(r1.status).toBe(201);
      const a1 = await request(app)
        .patch(`/api/requests/${r1.body.data.id}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(a1.status).toBe(200);
      expect(a1.body.data.status).toBe('dept_approved');

      // ...and the self-approval rule does not restrict the admin, even when
      // the request was created by a department_manager.
      const owned = await insertOwnedRequest({ requestedBy: dmA.id, deptId: deptA, whId: whA, itemId, unitCode });
      const a2 = await request(app)
        .patch(`/api/requests/${owned.id}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(a2.status).toBe(200);
      expect(a2.body.data.status).toBe('dept_approved');
    });

    test('E: sub_warehouse_manager can now approve pending requests (wm_approved flow)', async () => {
      const r = await createRequest(admin.token, deptA, whA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
      expect(r.status).toBe(201);

      const res = await request(app)
        .patch(`/api/requests/${r.body.data.id}/approve`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('wm_approved');
    });

    test('G: department_manager cannot create a material request (route 403 AUTH_FORBIDDEN)', async () => {
      const res = await createRequest(dmA.token, deptA, whA, [{ item_id: itemId, quantity: 1, unit_code: unitCode }]);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    test('H: direct service call to createRequest is rejected for department_manager (VALIDATION_ERROR)', async () => {
      const ctx = await loadAuthContext(dmA.id);
      expect(ctx).not.toBeNull();

      await expect(
        materialRequestsService.createRequest(
          dmA.id,
          {
            department_id: deptA,
            warehouse_id: whA,
            request_type: 'experiment',
            priority: 'normal',
            items: [{ item_id: itemId, quantity: 1, unit_code: unitCode }],
          },
          ctx!
        )
      ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });
  });
});
