import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * D12: the request catalog only lists items with stock available
 * (items.current_balance > 0).
 *
 * Previously a zero-balance item still appeared in the request catalog, so a
 * supervisor could create a request for an item the department's warehouse
 * simply did not have — forcing a wasted approve/issue cycle. The catalog is
 * the single source for the frontend request form, so fixing it here removes
 * out-of-stock items from the picker entirely.
 */
const prefix = `${TEST_PREFIX}catbal_`;
let app: any;

async function seedRoleUser(role: string, opts: { department_id?: number | null } = {}): Promise<{ id: number; username: string; password: string; token: string }> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${prefix}${role}_${shortId()}`;
  const userRes = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [username, password_hash, username, role, opts.department_id ?? null],
  );
  const id = userRes.rows[0].id;
  return { id, username, password, token: '' };
}

async function login(user: { username: string; password: string }): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

describe('D12: request catalog filters out-of-stock items', () => {
  let sup: { id: number; username: string; password: string; token: string };

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let whA: number;
  let itemPosId: number;
  let itemZeroId: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    whA = await seedWarehouse({ department_id: deptA });

    // Same department, same warehouse — differing only in current_balance.
    itemPosId  = await seedItem(catCode, unitCode, whA, 100);
    itemZeroId = await seedItem(catCode, unitCode, whA, 0);

    sup = await seedRoleUser('supervisor', { department_id: deptA });
    sup.token = await login(sup);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  test('in-stock items are listed; zero-balance items are excluded (D12)', async () => {
    const res = await request(app)
      .get('/api/requests/catalog')
      .set('Authorization', `Bearer ${sup.token}`);
    expect(res.status).toBe(200);

    const itemIds = res.body.data.items.map((i: any) => i.id);
    expect(itemIds).toContain(itemPosId);
    expect(itemIds).not.toContain(itemZeroId);
  });

  test('catalog shape is unchanged (department, warehouses, base_unit_code)', async () => {
    const res = await request(app)
      .get('/api/requests/catalog')
      .set('Authorization', `Bearer ${sup.token}`);
    expect(res.status).toBe(200);

    const catalog = res.body.data;
    expect(catalog.department.id).toBe(deptA);
    expect(catalog.warehouses.map((w: any) => w.id)).toContain(whA);
    const pos = catalog.items.find((i: any) => i.id === itemPosId);
    expect(pos.base_unit_code).toBe(unitCode);
  });
});