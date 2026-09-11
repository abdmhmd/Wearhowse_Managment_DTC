import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedDepartment, seedWarehouse, cleanup } from '../helpers';

/**
 * Admin User-Management regression tests:
 *
 *  ISSUE 1 — department_id must be persisted for department_manager,
 *            sub_warehouse_manager and supervisor on create and edit, and an
 *            unknown/inactive department is rejected cleanly (400).
 *  ISSUE 2 — delete must be PHYSICAL. The schema is designed for it:
 *            refresh_tokens / user_warehouses cascade, audit_logs null the
 *            actor; business tables (transactions.created_by,
 *            material_requests.requested_by, projects.created_by /
 *            supervisor_id, custodies.assigned_to, ...) RESTRICT/NO ACTION,
 *            so deleting a referenced user surfaces a 409 Conflict.
 */
const prefix = `${TEST_PREFIX}admin_crud_`;
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

describe('Admin user management (department + physical delete)', () => {
  let admin: AuthUser;
  let wmActor: AuthUser;
  let deptA: number;
  let deptB: number;
  let whA: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    deptA = await seedDepartment();
    deptB = await seedDepartment();
    whA = await seedWarehouse({ department_id: deptA });
    admin = await seedAuthUser('admin');
    wmActor = await seedAuthUser('sub_warehouse_manager');
    await pool.query(
      'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2)',
      [wmActor.id, whA]
    );
    admin.token = await login(admin);
    wmActor.token = await login(wmActor);
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
        role: 'supervisor',
        department_id: deptA,
        ...overrides,
      });

  test('create department_manager persists department_id', async () => {
    const res = await createUser({ role: 'department_manager', department_id: deptB });
    expect(res.status).toBe(201);
    expect(res.body.data.department_id).toBe(deptB);

    const row = await pool.query('SELECT department_id FROM users WHERE id = $1', [res.body.data.id]);
    expect(row.rows[0].department_id).toBe(deptB);
  });

  test('create supervisor persists department_id', async () => {
    const res = await createUser({ role: 'supervisor' });
    expect(res.status).toBe(201);
    expect(res.body.data.department_id).toBe(deptA);

    const row = await pool.query('SELECT department_id FROM users WHERE id = $1', [res.body.data.id]);
    expect(row.rows[0].department_id).toBe(deptA);
  });

  test('create sub_warehouse_manager persists an optional department_id', async () => {
    const res = await createUser({
      role: 'sub_warehouse_manager',
      department_id: deptA,
      warehouse_ids: [whA],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.department_id).toBe(deptA);

    const row = await pool.query('SELECT department_id FROM users WHERE id = $1', [res.body.data.id]);
    expect(row.rows[0].department_id).toBe(deptA);
  });

  test('create supervisor without department is rejected (400)', async () => {
    const res = await createUser({ department_id: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('create with a non-existent department is rejected (400)', async () => {
    const res = await createUser({ department_id: 99999999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('update department_manager moves their department', async () => {
    const created = await createUser({ role: 'department_manager', department_id: deptA });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ department_id: deptB });
    expect(res.status).toBe(200);
    expect(res.body.data.department_id).toBe(deptB);

    const row = await pool.query('SELECT department_id FROM users WHERE id = $1', [id]);
    expect(row.rows[0].department_id).toBe(deptB);
  });

  test('update can clear an optional department_id (WM)', async () => {
    const created = await createUser({
      role: 'sub_warehouse_manager',
      department_id: deptA,
      warehouse_ids: [whA],
    });
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ department_id: null });
    expect(res.status).toBe(200);
    expect(res.body.data.department_id).toBeNull();
  });

  test('update to an inactive/non-existent department is rejected (400)', async () => {
    const created = await createUser({ role: 'department_manager', department_id: deptA });
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ department_id: 99999999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('users list includes department fields', async () => {
    const wm = await createUser({
      role: 'sub_warehouse_manager',
      department_id: deptA,
      warehouse_ids: [whA],
    });
    expect(wm.status).toBe(201);
    const wmId = wm.body.data.id;

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .query({ limit: 100 });
    expect(res.status).toBe(200);

    const items: any[] = res.body.data.items;
    const withDept = items.find((u) => u.role === 'supervisor' && u.department_id === deptA);
    expect(withDept).toBeDefined();
    expect(withDept.department_name_ar).toEqual(withDept.department_name_en);

    const wmRow = items.find((u) => u.id === wmId);
    expect(wmRow.warehouse_ids).toEqual([whA]);
  });

  test('delete physically removes the user row and cascades user_warehouses', async () => {
    const created = await createUser({
      role: 'sub_warehouse_manager',
      department_id: deptA,
      warehouse_ids: [whA],
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const assignments = await pool.query('SELECT 1 FROM user_warehouses WHERE user_id = $1', [id]);
    expect(assignments.rowCount).toBe(1);

    const res = await request(app)
      .delete(`/api/users/${id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);

    const row = await pool.query('SELECT 1 FROM users WHERE id = $1', [id]);
    expect(row.rowCount).toBe(0);

    const cascade = await pool.query('SELECT 1 FROM user_warehouses WHERE user_id = $1', [id]);
    expect(cascade.rowCount).toBe(0);
  });

  test('delete a user referenced as project supervisor returns 409', async () => {
    const created = await createUser({ role: 'supervisor', department_id: deptA });
    const id = created.body.data.id;

    const projectNo = `${prefix}proj_${shortId()}`;
    await pool.query(
      `INSERT INTO projects (project_no, name, department_id, supervisor_id, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectNo, `${prefix}project_${shortId()}`, deptA, id, admin.id]
    );

    const res = await request(app)
      .delete(`/api/users/${id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_HAS_REFERENCES');

    const row = await pool.query('SELECT is_active FROM users WHERE id = $1', [id]);
    expect(row.rows[0].is_active).toBe(true);
  });

  test('administrator cannot delete their own account (400)', async () => {
    const res = await request(app)
      .delete(`/api/users/${admin.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('sub_warehouse_manager is denied user creation (403)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${wmActor.token}`)
      .send({
        username: `${prefix}forbidden_${shortId()}`,
        password: 'testPass123',
        full_name: 'Nope',
        role: 'supervisor',
        department_id: deptA,
      });
    expect(res.status).toBe(403);
  });
});
