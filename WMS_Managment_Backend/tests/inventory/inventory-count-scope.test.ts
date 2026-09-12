import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * D10: count recording is no longer admin-only at the route layer.
 *
 * The route guard on POST /sessions/:id/count was dropped (D10 Option B) and
 * replaced by a service-layer check that allows a sub-warehouse manager to
 * record counts in an inventory session opened by the Admin, *provided* the
 * session belongs to one of the manager's assigned warehouses.
 *
 * Open / view / close remain route-guarded admin-only (unchanged).
 */
const prefix = `${TEST_PREFIX}invcount_`;
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
  opts: { department_id?: number | null; warehouse_ids?: number[] } = {},
): Promise<SeedRoleUser> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${prefix}${role}_${shortId()}`;
  const userRes = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [username, password_hash, username, role, opts.department_id ?? null],
  );
  const id = userRes.rows[0].id;
  for (const wh of opts.warehouse_ids ?? []) {
    await pool.query(
      'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, wh],
    );
  }
  return { id, username, password, role, token: '' };
}

async function login(user: SeedRoleUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

describe('D10: sub-warehouse managers record counts in their assigned session only', () => {
  let admin: SeedRoleUser;
  let wmA: SeedRoleUser;
  let wmB: SeedRoleUser;
  let dm: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let whA: number;
  let whB: number;
  let itemA: number;
  let sessionA: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    whA = await seedWarehouse({ department_id: deptA });
    whB = await seedWarehouse({ department_id: deptA });
    itemA = await seedItem(catCode, unitCode, whA, 50);
    // seedItem only inserts a `items` row; the session snapshot reads
    // item_warehouse_stock, so home the item there explicitly (D10).
    await pool.query(
      'INSERT INTO item_warehouse_stock (item_id, warehouse_id, current_balance) VALUES ($1, $2, $3) ON CONFLICT (item_id, warehouse_id) DO UPDATE SET current_balance = EXCLUDED.current_balance',
      [itemA, whA, 50],
    );

    admin  = await seedRoleUser('admin');
    wmA    = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whA] });
    wmB    = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whB] });
    dm     = await seedRoleUser('department_manager', { department_id: deptA });

    admin.token  = await login(admin);
    wmA.token    = await login(wmA);
    wmB.token    = await login(wmB);
    dm.token     = await login(dm);

    // Admin opens a session for whA — the session is the source of truth for
    // the count boundary. openSession snapshots item_warehouse_stock rows.
    const open = await request(app)
      .post('/api/inventory/sessions')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ warehouse_id: whA, notes: `${prefix}session` });
    expect(open.status).toBe(201);
    expect(open.body.data.items_count).toBeGreaterThanOrEqual(1);
    sessionA = open.body.data.id;
  });

  afterAll(async () => {
    // Close any sessions opened by this suite (admin) first — triggers ADJ
    // transactions only if the final count differs from system qty. We always
    // restore the final count back to system balance below, so no ADJ is
    // generated and cleanup-db only needs to remove counts/sessions.
    await pool.query(
      `DELETE FROM inventory_counts
        WHERE session_id IN (SELECT id FROM inventory_sessions WHERE notes LIKE $1)`,
      [`${prefix}%`],
    );
    await pool.query(
      `DELETE FROM inventory_sessions WHERE notes LIKE $1`,
      [`${prefix}%`],
    );
    await cleanup(prefix);
  });

  // ---- count scope tests (D10) ----

  test('sub-warehouse manager records a count in the session of their assigned warehouse (D10)', async () => {
    const res = await request(app)
      .post(`/api/inventory/sessions/${sessionA}/count`)
      .set('Authorization', `Bearer ${wmA.token}`)
      .send({ item_id: itemA, counted_qty: 50 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.counted_qty)).toBe(50);
    expect(res.body.data.counted_by).toBe(wmA.id);
  });

  test('sub-warehouse manager cannot record a count in another warehouse\'s session (403)', async () => {
    const res = await request(app)
      .post(`/api/inventory/sessions/${sessionA}/count`)
      .set('Authorization', `Bearer ${wmB.token}`)
      .send({ item_id: itemA, counted_qty: 99 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  test('department_manager still cannot record counts (403, no inventory:count:record)', async () => {
    const res = await request(app)
      .post(`/api/inventory/sessions/${sessionA}/count`)
      .set('Authorization', `Bearer ${dm.token}`)
      .send({ item_id: itemA, counted_qty: 10 });
    expect(res.status).toBe(403);
  });

  // ---- admin-only guard unchanged for open/view/close ----

  test('sub-warehouse manager cannot open an inventory session (admin-only)', async () => {
    const res = await request(app)
      .post('/api/inventory/sessions')
      .set('Authorization', `Bearer ${wmA.token}`)
      .send({ warehouse_id: whA });
    expect(res.status).toBe(403);
  });

  test('sub-warehouse manager cannot view an inventory session (admin-only)', async () => {
    const res = await request(app)
      .get(`/api/inventory/sessions/${sessionA}`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(res.status).toBe(403);
  });

  test('sub-warehouse manager cannot close an inventory session (admin-only)', async () => {
    const res = await request(app)
      .post(`/api/inventory/sessions/${sessionA}/close`)
      .set('Authorization', `Bearer ${wmA.token}`);
    expect(res.status).toBe(403);
  });

  test('admin can still record a count and close the session (unchanged)', async () => {
    const record = await request(app)
      .post(`/api/inventory/sessions/${sessionA}/count`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ item_id: itemA, counted_qty: 50 }); // matches system qty → no ADJ
    expect(record.status).toBe(200);

    const close = await request(app)
      .post(`/api/inventory/sessions/${sessionA}/close`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(close.status).toBe(200);
    expect(close.body.data.variances_count).toBe(0);
  });
});
