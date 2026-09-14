import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedDepartment, seedWarehouse, cleanup } from '../helpers';

/**
 * Department-required rule regression tests.
 *
 * Every non-admin role (sub_warehouse_manager / department_manager /
 * supervisor) MUST be assigned a department on create and on update. The
 * enforced error code is DEPARTMENT_REQUIRED_FOR_ROLE (400), surfaced by the
 * service so the frontend can map it to a specific message.
 */
const prefix = `${TEST_PREFIX}dept_req_`;
let app: any;

interface AuthUser {
  id: number;
  username: string;
  password: string;
  token: string;
}

async function seedAuthUser(role: string, opts: { department_id?: number | null } = {}): Promise<AuthUser> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${prefix}actor_${role}_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [username, password_hash, username, role, opts.department_id ?? null]
  );
  return { id: res.rows[0].id, username, password, token: '' };
}

async function login(user: AuthUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

describe('Users: department is required for non-admin roles', () => {
  let admin: AuthUser;
  let deptA: number;
  let whA: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    deptA = await seedDepartment();
    whA = await seedWarehouse({ department_id: deptA });
    admin = await seedAuthUser('admin');
    admin.token = await login(admin);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  const createUser = (overrides: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: `${prefix}new_${shortId()}`,
        password: 'testPass123',
        full_name: 'Created User',
        role: 'sub_warehouse_manager',
        department_id: deptA,
        warehouse_ids: [whA],
        ...overrides,
      });

  test('create rejects a sub_warehouse_manager without a department (400 DEPARTMENT_REQUIRED_FOR_ROLE)', async () => {
    const res = await createUser({ department_id: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEPARTMENT_REQUIRED_FOR_ROLE');
  });

  test('create accepts a sub_warehouse_manager with a valid department (201)', async () => {
    const res = await createUser({ role: 'department_manager', department_id: deptA });
    expect(res.status).toBe(201);
    expect(res.body.data.department_id).toBe(deptA);

    const wm = await createUser({ role: 'sub_warehouse_manager', department_id: deptA });
    expect(wm.status).toBe(201);
    expect(wm.body.data.department_id).toBe(deptA);
  });

  test('update rejects demoting an admin to sub_warehouse_manager without a department (400 DEPARTMENT_REQUIRED_FOR_ROLE)', async () => {
    const created = await createUser({ role: 'admin', department_id: undefined });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'sub_warehouse_manager', warehouse_ids: [whA] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEPARTMENT_REQUIRED_FOR_ROLE');
  });

  test('update accepts moving a sub_warehouse_manager to a new department (200)', async () => {
    const created = await createUser({ role: 'sub_warehouse_manager', department_id: deptA });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ department_id: deptA });
    expect(res.status).toBe(200);
    expect(res.body.data.department_id).toBe(deptA);
  });
});