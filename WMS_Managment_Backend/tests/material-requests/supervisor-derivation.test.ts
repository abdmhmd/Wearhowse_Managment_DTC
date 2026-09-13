import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Supervisor destination derivation (fix for the blocked supervisor create):
 *
 * A supervisor's material request is entirely DERIVED server-side:
 *   department            = the authenticated user's department (never the payload)
 *   destination warehouse = the department's OWN active sub-warehouse
 *                           (is_main = false); lowest id wins when multiple
 * The supervisor needs NO `user_warehouses` assignment and is NEVER asked to
 * pick a warehouse — any warehouse_id injected in the payload is ignored.
 *
 *   1. no warehouse_id + one sub-warehouse               -> 201, derived sub-warehouse
 *   2. multiple sub-warehouses                           -> 201, lowest id wins (no selector)
 *   3. injected foreign / own other warehouse_id          -> IGNORED, derived id used (201)
 *   4. department WITHOUT a sub-warehouse (main only)     -> 400 NO_SUB_WAREHOUSE_FOR_DEPARTMENT
 *   5. item stored in the department MAIN warehouse       -> 201 (catalog/create scope aligned)
 *   6. item of another department                         -> 400 ITEM_NOT_IN_DEPARTMENT
 */
const prefix = `${TEST_PREFIX}supderiv_`;
let app: any;

interface SeedRoleUser {
  id: number;
  username: string;
  password: string;
  token: string;
}

async function seedSupervisor(departmentId: number): Promise<SeedRoleUser> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${prefix}sup_${shortId()}`;
  const userRes = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
     VALUES ($1, $2, $3, 'supervisor', $4, true) RETURNING id`,
    [username, password_hash, username, departmentId]
  );
  const id = userRes.rows[0].id;
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  expect(res.status).toBe(200);
  return { id, username, password, token: res.body.data.token as string };
}

function createRequest(token: string, warehouseId: number | undefined, items: Array<{ item_id: number; quantity: number; unit_code: string }>) {
  const body: Record<string, unknown> = {
    request_type: 'experiment',
    priority: 'normal',
    notes: `${prefix}note_${shortId()}`,
    items,
  };
  if (warehouseId !== undefined) body.warehouse_id = warehouseId;
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('Create request: supervisor destination derivation (no user_warehouses, no selection)', () => {
  let catCode: string;
  let unitCode: string;

  // Dept with exactly one sub-warehouse.
  let deptSingle: number;
  let mainSingle: number;
  let subSingle: number;
  let itemAtMain: number;

  // Dept with MULTIPLE sub-warehouses (lowest id must win).
  let deptMulti: number;
  let mainMulti: number;
  let subLow: number;
  let subHigh: number;
  let itemInMultiMain: number;

  // Dept with NO sub-warehouse (main only).
  let deptNoSub: number;
  let mainNoSub: number;

  // Item in ANOTHER department (rejection check).
  let deptOther: number;
  let mainOther: number;
  let itemOther: number;

  let supSingle: SeedRoleUser;
  let supMulti: SeedRoleUser;
  let supNoSub: SeedRoleUser;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();

    deptSingle = await seedDepartment();
    mainSingle = await seedWarehouse({ department_id: deptSingle, is_main: true });
    subSingle = await seedWarehouse({ department_id: deptSingle });
    itemAtMain = await seedItem(catCode, unitCode, mainSingle, 50);

    deptMulti = await seedDepartment();
    mainMulti = await seedWarehouse({ department_id: deptMulti, is_main: true });
    subLow = await seedWarehouse({ department_id: deptMulti });
    subHigh = await seedWarehouse({ department_id: deptMulti });
    itemInMultiMain = await seedItem(catCode, unitCode, mainMulti, 40);
    expect(subLow).toBeLessThan(subHigh);

    deptNoSub = await seedDepartment();
    mainNoSub = await seedWarehouse({ department_id: deptNoSub, is_main: true });

    deptOther = await seedDepartment();
    mainOther = await seedWarehouse({ department_id: deptOther, is_main: true });
    itemOther = await seedItem(catCode, unitCode, mainOther, 30);

    // Supervisors are created WITHOUT any user_warehouses assignment — by design.
    supSingle = await seedSupervisor(deptSingle);
    supMulti = await seedSupervisor(deptMulti);
    supNoSub = await seedSupervisor(deptNoSub);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  test('1: no warehouse_id + single sub-warehouse -> 201, derived sub-warehouse (no user_warehouses)', async () => {
    const res = await createRequest(supSingle.token, undefined, [{ item_id: itemAtMain, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(subSingle);
    expect(res.body.data.department_id).toBe(deptSingle);

    const row = await pool.query(
      'SELECT department_id, warehouse_id, status FROM material_requests WHERE id = $1',
      [res.body.data.id]
    );
    expect(row.rows[0].department_id).toBe(deptSingle);
    expect(row.rows[0].warehouse_id).toBe(subSingle);
    expect(row.rows[0].status).toBe('pending');

    const assigned = await pool.query(
      'SELECT COUNT(*)::int AS n FROM user_warehouses WHERE user_id = $1',
      [supSingle.id]
    );
    expect(assigned.rows[0].n).toBe(0); // derivation must not depend on assignments
  });

  test('2: multiple sub-warehouses -> 201, lowest id wins (never asks for a selection)', async () => {
    const res = await createRequest(supMulti.token, undefined, [{ item_id: itemInMultiMain, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(subLow);
    expect(res.body.data.department_id).toBe(deptMulti);
  });

  test('3: injected warehouse_id (own other sub-warehouse) -> IGNORED, derived lowest id used (201)', async () => {
    const res = await createRequest(supMulti.token, subHigh, [{ item_id: itemInMultiMain, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(subLow); // NOT subHigh
    expect(res.body.data.department_id).toBe(deptMulti);
  });

  test('4: department WITHOUT a sub-warehouse (main only) -> 400 NO_SUB_WAREHOUSE_FOR_DEPARTMENT', async () => {
    const res = await createRequest(supNoSub.token, undefined, [{ item_id: itemAtMain, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_SUB_WAREHOUSE_FOR_DEPARTMENT');

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM material_requests WHERE requested_by = $1',
      [supNoSub.id]
    );
    expect(count.rows[0].n).toBe(0); // nothing persisted
  });

  test('5: item stored in the department MAIN warehouse -> 201 (catalog/create scope aligned)', async () => {
    // Regression for the reported "unexpected error": the catalog offers items
    // stored in ANY active department warehouse (incl. the main stock source),
    // so create-time item validation must accept them too.
    const res = await createRequest(supSingle.token, undefined, [{ item_id: itemAtMain, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(subSingle);
  });

  test('6: item of ANOTHER department -> 400 ITEM_NOT_IN_DEPARTMENT', async () => {
    const res = await createRequest(supSingle.token, undefined, [{ item_id: itemOther, quantity: 1, unit_code: unitCode }]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ITEM_NOT_IN_DEPARTMENT');
    expect(res.body.error.message).toMatch(/does not belong to your department/i);
  });
});