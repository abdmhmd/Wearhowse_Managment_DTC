import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

export const PR_TEST_PREFIX = `${TEST_PREFIX}pr_`;

/**
 * Suite teardown: clean seeded rows AND close this suite's pg pool
 * (mirrors the purchase-orders suite teardown).
 */
export async function prTeardown(prefix: string): Promise<void> {
  await cleanup(prefix);
  await pool.end();
}

export interface SeedUser {
  id: number;
  username: string;
  password: string;
  token: string;
}

export async function seedRoleUser(
  role: string,
  opts: { department_id?: number | null; warehouse_ids?: number[] } = {}
): Promise<SeedUser> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${PR_TEST_PREFIX}${role}_${shortId()}`;
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

export async function login(app: any, user: SeedUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  if (res.status !== 200) throw new Error(`login failed for ${user.username}: ${res.status}`);
  return res.body.data.token as string;
}

/**
 * Standard multi-department fixture for the purchase-request suite:
 *   deptA: mainWhA (is_main: true) + subWhA1 + subWhA2 — items requested live here
 *   deptB: mainWhB (is_main: true) — foreign department / foreign item
 */
export async function seedPrWorld() {
  const catCode = await seedCategory();
  const unitCode = await seedUnit();

  const deptA = await seedDepartment();
  const mainWhA = await seedWarehouse({ department_id: deptA, is_main: true });
  const subWhA1 = await seedWarehouse({ department_id: deptA });
  const subWhA2 = await seedWarehouse({ department_id: deptA });
  const deptB = await seedDepartment();
  const mainWhB = await seedWarehouse({ department_id: deptB, is_main: true });

  const itemId = await seedItem(catCode, unitCode, mainWhA, 0);
  const itemId2 = await seedItem(catCode, unitCode, mainWhA, 0);
  const foreignItemId = await seedItem(catCode, unitCode, mainWhB, 0);
  const foreignItemId2 = await seedItem(catCode, unitCode, mainWhB, 0);

  const admin = await seedRoleUser('admin');
  const wmA = await seedRoleUser('sub_warehouse_manager', { department_id: deptA, warehouse_ids: [mainWhA] });
  const wmB = await seedRoleUser('sub_warehouse_manager', { department_id: deptB, warehouse_ids: [mainWhB] });
  const supervisor = await seedRoleUser('supervisor', { department_id: deptA });
  const deptMgrA = await seedRoleUser('department_manager', { department_id: deptA });
  const deptMgrB = await seedRoleUser('department_manager', { department_id: deptB });

  return {
    catCode, unitCode,
    deptA, mainWhA, subWhA1, subWhA2, deptB, mainWhB,
    itemId, itemId2, foreignItemId, foreignItemId2,
    users: { admin, wmA, wmB, supervisor, deptMgrA, deptMgrB },
  };
}

export type PrWorld = Awaited<ReturnType<typeof seedPrWorld>>;

/** Create a purchase request through the API and return the response. */
export async function apiCreatePr(
  app: any,
  token: string,
  body: Record<string, unknown>
): Promise<any> {
  return request(app)
    .post('/api/purchase-requests')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

export async function apiPatchPr(
  app: any,
  token: string,
  path: string,
  body: Record<string, unknown> = {}
): Promise<any> {
  return request(app)
    .patch(`/api/purchase-requests${path}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

export const validPrBody = (
  warehouseId: number,
  itemA: number,
  itemB: number,
  unitCode: string
) => ({
  warehouse_id: warehouseId,
  notes: 'Test purchase request',
  items: [
    { item_id: itemA, quantity: 10, unit_code: unitCode },
    { item_id: itemB, quantity: 5, unit_code: unitCode, notes: 'urgent' },
  ],
});