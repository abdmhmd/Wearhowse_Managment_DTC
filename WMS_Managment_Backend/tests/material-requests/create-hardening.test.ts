import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Create-request hardening (backend enforcement):
 *
 * The destination warehouse AND the request department are DERIVED from the
 * authenticated user's warehouse assignments, never trusted from the payload:
 *
 *   1. sub_warehouse_manager, no department_id in payload    -> warehouse + dept derived
 *   2. sub_warehouse_manager, matching department_id         -> accepted
 *   3. sub_warehouse_manager, spoofed foreign department_id  -> 409 conflict
 *   4. sub_warehouse_manager, payload warehouse ignored      -> assigned warehouse is used (no privilege escalation)
 *   5. sub_warehouse_manager, payload warehouse that does not exist -> still derived safely (no crash)
 *   6. multi-assignment sub_warehouse_manager                -> always the first assigned warehouse (deterministic)
 *   7. sub_warehouse_manager, zero assignments + valid warehouse_id  -> 201 (FALLBACK)
 *   8. sub_warehouse_manager, zero assignments + missing warehouse_id -> 400 (FALLBACK)
 *   9. sub_warehouse_manager, zero assignments + MAIN warehouse       -> 400 (FALLBACK)
 *  10. sub_warehouse_manager, zero assignments + non-existent warehouse -> 400 (FALLBACK)
 *  11. sub_warehouse_manager assigned only to a MAIN warehouse  -> 400 (never an eligible destination)
 *  12. warehouse with no department link                -> 400
 *  13. admin, no department_id                    -> 403 (no requests:create after phase 2)
 *  14. admin, spoofed foreign department_id       -> 403 (blocked at the route)
 *  15. admin, MAIN warehouse as destination       -> 403 (blocked at the route)
 *  16. department_manager POST /api/requests             -> 403 (approver-only rule unchanged)
 */
const prefix = `${TEST_PREFIX}reqhard_`;
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

function createRequest(token: string, whId: number | null | undefined, items: Array<{ item_id: number; quantity: number; unit_code: string }>, deptId?: number | null) {
  const body: Record<string, unknown> = {
    request_type: 'experiment',
    priority: 'normal',
    notes: `${prefix}note_${shortId()}`,
    items,
  };
  if (whId != null) body.warehouse_id = whId;
  if (deptId !== undefined) body.department_id = deptId;
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('Create request: server-derived warehouse + department enforcement', () => {
  let admin: SeedRoleUser;
  let wmA: SeedRoleUser;
  let wmMulti: SeedRoleUser;
  let wmNoDept: SeedRoleUser;
  let wmMain: SeedRoleUser;
  let wmZero: SeedRoleUser;
  let dmA: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whA: number;
  let whB: number;
  let whMain: number;
  let whNoDept: number;
  let itemId: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    deptB = await seedDepartment();
    whA = await seedWarehouse({ department_id: deptA });
    whB = await seedWarehouse({ department_id: deptB });
    whMain = await seedWarehouse({ department_id: deptA, is_main: true });
    await seedWarehouse({ department_id: deptB, is_main: true });
    whNoDept = await seedWarehouse();
    itemId = await seedItem(catCode, unitCode, whA, 100);

    admin = await seedRoleUser('admin');
    wmA = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whA] });
    wmMulti = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whA, whB] });
    wmNoDept = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whNoDept] });
    wmMain = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whMain] });
    wmZero = await seedRoleUser('sub_warehouse_manager');
    dmA = await seedRoleUser('department_manager', { department_id: deptA });

    admin.token = await login(admin);
    wmA.token = await login(wmA);
    wmMulti.token = await login(wmMulti);
    wmNoDept.token = await login(wmNoDept);
    wmMain.token = await login(wmMain);
    wmZero.token = await login(wmZero);
    dmA.token = await login(dmA);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  const items = () => [{ item_id: itemId, quantity: 1, unit_code: unitCode }];

  test('1: sub_warehouse_manager with no department_id -> warehouse + department derived', async () => {
    const res = await createRequest(wmA.token, whA, items());
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(whA);
    expect(res.body.data.department_id).toBe(deptA);

    const row = await pool.query(
      'SELECT department_id, warehouse_id, requested_by, status FROM material_requests WHERE id = $1',
      [res.body.data.id]
    );
    expect(row.rows[0].department_id).toBe(deptA);
    expect(row.rows[0].warehouse_id).toBe(whA);
    expect(row.rows[0].requested_by).toBe(wmA.id);
    expect(row.rows[0].status).toBe('pending');
  });

  test('2: sub_warehouse_manager with matching department_id -> accepted', async () => {
    const res = await createRequest(wmA.token, whA, items(), deptA);
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(whA);
    expect(res.body.data.department_id).toBe(deptA);
  });

  test('3: sub_warehouse_manager with spoofed foreign department_id -> 409 conflict', async () => {
    const res = await createRequest(wmA.token, whA, items(), deptB);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEPARTMENT_WAREHOUSE_MISMATCH');
  });

  test('4: sub_warehouse_manager attempting to target an unassigned warehouse -> 400 rejection', async () => {
    const res = await createRequest(wmA.token, whB, items());
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not in your assigned eligible warehouses');
  });

  test('5: sub_warehouse_manager payload pointing at a non-existent warehouse -> 400 rejection', async () => {
    const res = await createRequest(wmA.token, 99999999, items());
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not in your assigned eligible warehouses');
  });

  test('6: multi-assignment sub_warehouse_manager can target any assigned warehouse or default to first', async () => {
    // Target whA explicitly
    const resA = await createRequest(wmMulti.token, whA, items());
    expect(resA.status).toBe(201);
    expect(resA.body.data.warehouse_id).toBe(whA);
    expect(resA.body.data.department_id).toBe(deptA);

    // Target whB explicitly
    const resB = await createRequest(wmMulti.token, whB, items());
    expect(resB.status).toBe(201);
    expect(resB.body.data.warehouse_id).toBe(whB);
    expect(resB.body.data.department_id).toBe(deptB);

    // Omit warehouse_id -> defaults to first assigned (whA)
    const resDefault = await createRequest(wmMulti.token, null, items());
    expect(resDefault.status).toBe(201);
    expect(resDefault.body.data.warehouse_id).toBe(whA);
    expect(resDefault.body.data.department_id).toBe(deptA);
  });

  test('7: sub_warehouse_manager with ZERO assignments + valid warehouse_id -> 201 (fallback)', async () => {
    const res = await createRequest(wmZero.token, whA, items());
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(whA);
    expect(res.body.data.department_id).toBe(deptA);
  });

  test('8: sub_warehouse_manager with ZERO assignments + missing warehouse_id -> 400 (clear message)', async () => {
    const res = await createRequest(wmZero.token, null, items());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/no assigned warehouses/i);
  });

  test('9: sub_warehouse_manager with ZERO assignments + MAIN warehouse -> 400 (main is never a destination)', async () => {
    const res = await createRequest(wmZero.token, whMain, items());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/no assigned warehouses/i);
  });

  test('10: sub_warehouse_manager with ZERO assignments + non-existent warehouse -> 400 (clear message)', async () => {
    const res = await createRequest(wmZero.token, 99999999, items());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/no assigned warehouses/i);
  });

  test('11: sub_warehouse_manager assigned ONLY to a MAIN warehouse -> 400 (has assignments, none eligible)', async () => {
    const res = await createRequest(wmMain.token, whMain, items());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('12: warehouse with no department link -> 400', async () => {
    const res = await createRequest(wmNoDept.token, whNoDept, items());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('13: admin with no department_id -> 403 (no requests:create after phase 2)', async () => {
    const res = await createRequest(admin.token, whA, items());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  test('14: admin with spoofed foreign department_id -> 403 (blocked at the route)', async () => {
    const res = await createRequest(admin.token, whA, items(), deptB);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  test('15: admin targeting the MAIN warehouse as destination -> 403 (blocked at the route)', async () => {
    const res = await createRequest(admin.token, whMain, items(), deptA);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  test('16: department_manager still cannot create requests (403)', async () => {
    const res = await createRequest(dmA.token, whA, items(), deptA);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });
});
