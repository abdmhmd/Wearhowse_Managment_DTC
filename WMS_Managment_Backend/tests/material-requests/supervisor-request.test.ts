import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { projectsService } from '../../src/modules/projects/projects.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Supervisor request creation (backend enforcement):
 *
 * The supervisor role (027) creates material requests for THEIR OWN department:
 * the department is DERIVED from the authenticated user (never trusted from the
 * payload), the destination warehouse MUST belong to that department, and a
 * project request is allowed ONLY when project.supervisor_id == user.id and the
 * project belongs to the supervisor's department (existing 409 rule).
 *
 *   1. supervisor, own department warehouse              -> 201 (department derived)
 *   2. supervisor, warehouse of ANOTHER department       -> 400 (rejected)
 *   3. supervisor, own warehouse + spoofed foreign department_id -> 409 conflict
 *   4. supervisor, own project (supervisor_id == user.id)-> 201
 *   5. supervisor, another supervisor's project (same dept) -> 400 (rejected)
 *   6. supervisor, project of another department         -> 409 PROJECT_DEPARTMENT_MISMATCH
 *   7. department_manager POST /api/requests             -> 403 (approver rule unchanged, 022)
 *   8. sub_warehouse_manager create                          -> 400 (unassigned target rejected)
 *   9. admin create                             -> 403 (no requests:create after phase 2)
 *  10. supervisor list scopes to OWN requests only (requests:view_own)
 *  11. supervisor detail: own request 200, other user's request 404
 *  12. supervisor catalog: dept + own warehouses + dept items + units (no 403)
 *  13. supervisor create with an item of ANOTHER department      -> 400 (rejected)
 *  14. supervisor create with an invalid/inactive unit          -> 400 (rejected)
 *  15. department_manager GET /api/requests/catalog             -> 403 (no requests:create)
 */
const prefix = `${TEST_PREFIX}supreq_`;
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

function createRequest(
  token: string,
  whId: number | null | undefined,
  items: Array<{ item_id: number; quantity: number; unit_code: string }>,
  opts: { deptId?: number | null; projectId?: number | null; requestType?: string } = {}
) {
  const body: Record<string, unknown> = {
    request_type: opts.requestType ?? 'experiment',
    priority: 'normal',
    notes: `${prefix}note_${shortId()}`,
    items,
  };
  if (whId != null) body.warehouse_id = whId;
  if (opts.deptId !== undefined) body.department_id = opts.deptId;
  if (opts.projectId != null) body.project_id = opts.projectId;
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('Create request: supervisor department + project enforcement', () => {
  let admin: SeedRoleUser;
  let supA: SeedRoleUser;
  let supB: SeedRoleUser;
  let dmA: SeedRoleUser;
  let wmA: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whA: number;
  let whB: number;
  let itemId: number;
  let itemBId: number;

  let projectOwn: number;
  let projectSupB: number;
  let projectDeptB: number;

  let otherRequestId: number;
  let ownRequestId: number;

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
    itemBId = await seedItem(catCode, unitCode, whB, 50);

    admin = await seedRoleUser('admin');
    supA = await seedRoleUser('supervisor', { department_id: deptA });
    supB = await seedRoleUser('supervisor', { department_id: deptB });
    dmA = await seedRoleUser('department_manager', { department_id: deptA });
    wmA = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whA] });

    admin.token = await login(admin);
    supA.token = await login(supA);
    supB.token = await login(supB);
    dmA.token = await login(dmA);
    wmA.token = await login(wmA);

    // Projects: one supervised by supA in deptA, one by supB in deptA
    // (same department, different supervisor), one by supB in deptB.
    projectOwn = (await projectsService.create(supA.id, {
      name: `${prefix}projOwn`,
      department_id: deptA,
      supervisor_id: supA.id,
    })).id;
    projectSupB = (await projectsService.create(supB.id, {
      name: `${prefix}projSupB`,
      department_id: deptA,
      supervisor_id: supB.id,
    })).id;
    projectDeptB = (await projectsService.create(supB.id, {
      name: `${prefix}projDeptB`,
      department_id: deptB,
      supervisor_id: supB.id,
    })).id;
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  const items = () => [{ item_id: itemId, quantity: 1, unit_code: unitCode }];

  test('1: supervisor + own department warehouse -> 201 (department derived from user)', async () => {
    const res = await createRequest(supA.token, whA, items());
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(whA);
    expect(res.body.data.department_id).toBe(deptA);
    ownRequestId = res.body.data.id;

    const row = await pool.query(
      'SELECT department_id, warehouse_id, requested_by, status FROM material_requests WHERE id = $1',
      [res.body.data.id]
    );
    expect(row.rows[0].department_id).toBe(deptA);
    expect(row.rows[0].warehouse_id).toBe(whA);
    expect(row.rows[0].requested_by).toBe(supA.id);
    expect(row.rows[0].status).toBe('pending');
  });

  test('2: supervisor + warehouse of ANOTHER department -> 400 (rejected)', async () => {
    const res = await createRequest(supA.token, whB, items());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/does not belong to your department/i);

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM material_requests WHERE requested_by = $1',
      [supA.id]
    );
    expect(count.rows[0].n).toBe(1); // only the request from test 1
  });

  test('3: supervisor + own warehouse + spoofed foreign department_id -> 409 conflict', async () => {
    const res = await createRequest(supA.token, whA, items(), { deptId: deptB });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEPARTMENT_WAREHOUSE_MISMATCH');
  });

  test('4: supervisor + OWN project -> 201', async () => {
    const res = await createRequest(supA.token, whA, items(), { projectId: projectOwn, requestType: 'project' });
    expect(res.status).toBe(201);
    expect(res.body.data.project_id).toBe(projectOwn);
    expect(res.body.data.department_id).toBe(deptA);
  });

  test('5: supervisor + another supervisor\'s project (same department) -> 400 (rejected)', async () => {
    const res = await createRequest(supA.token, whA, items(), { projectId: projectSupB, requestType: 'project' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/project you supervise/i);
  });

  test('6: supervisor + project of ANOTHER department -> 409 PROJECT_DEPARTMENT_MISMATCH', async () => {
    const res = await createRequest(supA.token, whA, items(), { projectId: projectDeptB, requestType: 'project' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROJECT_DEPARTMENT_MISMATCH');
  });

  test('7: department_manager still cannot create requests (403, unchanged by 022)', async () => {
    const res = await createRequest(dmA.token, whA, items(), { deptId: deptA });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  test('8: sub_warehouse_manager targeting an unassigned warehouse is rejected (400)', async () => {
    const res = await createRequest(wmA.token, whB, items());
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not in your assigned eligible warehouses');
  });

  test('9: admin can no longer create requests (403 AUTH_FORBIDDEN)', async () => {
    const res = await createRequest(admin.token, whB, items());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  test('9b: supervisor of another department creates a foreign request (scoping target)', async () => {
    const res = await createRequest(supB.token, whB, [{ item_id: itemBId, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(201);
    otherRequestId = res.body.data.id;
  });

  test('10: supervisor list scopes to OWN requests only (requests:view_own)', async () => {
    const res = await request(app)
      .get('/api/requests')
      .set('Authorization', `Bearer ${supA.token}`)
      .query({ limit: 100 });
    expect(res.status).toBe(200);
    const itemsList = res.body.data.items;
    expect(itemsList.length).toBeGreaterThan(0);

    const dbRows = await pool.query(
      `SELECT id FROM material_requests WHERE is_active = true AND requested_by = $1 ORDER BY id`,
      [supA.id]
    );
    const expectedIds = dbRows.rows.map((r: any) => r.id);
    const actualIds = itemsList.map((it: any) => it.id);
    expect(actualIds.every((id: number) => expectedIds.includes(id))).toBe(true);
    expect(actualIds).not.toContain(otherRequestId);
  });

  test('11: supervisor detail — own request 200, another user\'s request 404', async () => {
    const own = await request(app)
      .get(`/api/requests/${ownRequestId}`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(own.status).toBe(200);
    expect(own.body.data.requested_by).toBe(supA.id);

    const foreign = await request(app)
      .get(`/api/requests/${otherRequestId}`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(foreign.status).toBe(404);
  });

  test('12: supervisor catalog — own department + own warehouses + dept items + units (no 403)', async () => {
    const res = await request(app)
      .get('/api/requests/catalog')
      .set('Authorization', `Bearer ${supA.token}`);
    expect(res.status).toBe(200);

    const catalog = res.body.data;
    expect(catalog.department.id).toBe(deptA);
    expect(catalog.department.name_ar).toBeTruthy();

    // Only warehouses of the supervisor's department are returned.
    const whIds = catalog.warehouses.map((w: any) => w.id);
    expect(whIds).toContain(whA);
    expect(whIds).not.toContain(whB);

    // Only items stored in the department's warehouses are returned.
    const itemIds = catalog.items.map((i: any) => i.id);
    expect(itemIds).toContain(itemId);
    expect(itemIds).not.toContain(itemBId);

    // All active units are returned (unit selector).
    // NOTE: the catalog no longer exposes a global units list — the request
    // unit is derived from each item's base unit (base_unit_code).
    expect(catalog.items[0].base_unit_code).toBeDefined();
  });

  test('13: supervisor create with an item of ANOTHER department -> 400 (rejected)', async () => {
    const res = await createRequest(supA.token, whA, [{ item_id: itemBId, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/does not belong to your department/i);

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM material_requests WHERE requested_by = $1',
      [supA.id]
    );
    expect(count.rows[0].n).toBe(2); // only test 1 + test 4 so far
  });

  test('14: forged unit_code is IGNORED — the item base unit is persisted (never the forged unit)', async () => {
    const res = await createRequest(supA.token, whA, [{ item_id: itemId, quantity: 1, unit_code: 'NO_SUCH_UNIT' }]);
    expect(res.status).toBe(201);
    const details = await pool.query(
      'SELECT unit_code FROM material_request_details WHERE request_id = $1',
      [res.body.data.id]
    );
    expect(details.rows[0].unit_code).toBe(unitCode); // base unit, NOT 'NO_SUCH_UNIT'
  });

  test('15: department_manager GET /api/requests/catalog -> 403 (no requests:create)', async () => {
    const res = await request(app)
      .get('/api/requests/catalog')
      .set('Authorization', `Bearer ${dmA.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });
});
