import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

export const PO_TEST_PREFIX = `${TEST_PREFIX}po_`;

/**
 * Suite teardown: clean seeded rows AND close this suite's pg pool.
 * Jest reuses one worker process for all suites; without an explicit
 * pool.end() every suite's idle connections linger until GC and eventually
 * exhaust PostgreSQL's max_connections ("sorry, too many clients already").
 */
export async function poTeardown(prefix: string): Promise<void> {
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
  const username = `${PO_TEST_PREFIX}${role}_${shortId()}`;
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

export async function seedSupplier(): Promise<number> {
  const name = `${PO_TEST_PREFIX}supplier_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO suppliers (name_ar, name_en, is_active) VALUES ($1, $1, true) RETURNING id`,
    [name]
  );
  return res.rows[0].id;
}

export async function seedStock(itemId: number, warehouseId: number, balance: number): Promise<void> {
  await pool.query(
    `INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance)
     VALUES ($1, $2, $3)
     ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = $3`,
    [itemId, warehouseId, balance]
  );
}

export async function getStock(itemId: number, warehouseId: number): Promise<number> {
  const res = await pool.query(
    'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
    [itemId, warehouseId]
  );
  return res.rows.length ? Number(res.rows[0].current_balance) : 0;
}

/**
 * Standard multi-department fixture used by the purchase-order suite:
 *   deptA: mainWhA (stock source) + subWhA1 + subWhA2
 *   deptB: mainWhB + subWhB (foreign department)
 */
export async function seedPoWorld() {
  const catCode = await seedCategory();
  const unitCode = await seedUnit();

  const deptA = await seedDepartment();
  const mainWhA = await seedWarehouse({ department_id: deptA, is_main: true });
  const subWhA1 = await seedWarehouse({ department_id: deptA });
  const subWhA2 = await seedWarehouse({ department_id: deptA });
  const deptB = await seedDepartment();
  const mainWhB = await seedWarehouse({ department_id: deptB, is_main: true });
  const subWhB = await seedWarehouse({ department_id: deptB });

  const supplierId = await seedSupplier();
  const itemId = await seedItem(catCode, unitCode, mainWhA, 0);
  const itemId2 = await seedItem(catCode, unitCode, mainWhA, 0);

  const admin = await seedRoleUser('system_admin');
  // WM owns the main warehouse + ONE sub-warehouse (subWhA2 intentionally NOT assigned).
  const wmMain = await seedRoleUser('warehouse_manager', { warehouse_ids: [mainWhA, subWhA1] });
  const wmB = await seedRoleUser('warehouse_manager', { warehouse_ids: [mainWhB] });
  const supervisor = await seedRoleUser('supervisor', { department_id: deptA });
  const deptMgr = await seedRoleUser('department_manager', { department_id: deptA });

  return {
    catCode, unitCode,
    deptA, mainWhA, subWhA1, subWhA2, deptB, mainWhB, subWhB,
    supplierId, itemId, itemId2,
    users: { admin, wmMain, wmB, supervisor, deptMgr },
  };
}

export type PoWorld = Awaited<ReturnType<typeof seedPoWorld>>;

/** Create a PO through the API and return the created body. */
export async function apiCreatePo(
  app: any,
  token: string,
  body: Record<string, unknown>
): Promise<any> {
  return request(app)
    .post('/api/purchase-orders')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}
