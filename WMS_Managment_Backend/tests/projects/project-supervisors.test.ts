import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedWarehouse, seedDepartment, cleanup } from '../helpers';

/**
 * GET /api/users/supervisors department-scoping regression tests.
 *
 * Root cause fixed: the route was guarded by `users:view` (revoked from
 * warehouse_manager in migration 019), so the Projects page supervisor
 * dropdown got 403 for warehouse managers. The route now uses a dedicated
 * `projects:supervisors` permission and the SERVICE scopes the result to the
 * caller's department:
 *
 *   SUP-1  a warehouse_manager sees only supervisors of their own department
 *   SUP-2  a warehouse_manager never sees another department's supervisors
 *   SUP-3  a warehouse_manager with no department gets an empty list (fail-closed)
 *   SUP-4  system_admin still sees ALL supervisors (GLOBAL scope unchanged)
 *   SUP-5  department_manager keeps its existing access (403) — unchanged
 *
 * Note: with the dedicated `supervisor` role (migration 027) the candidate
 * list contains users with role = 'supervisor' only. Department Heads
 * (department_manager) and warehouse managers are NOT candidates.
 */
const prefix = `${TEST_PREFIX}projsup_`;
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
  return res.body.data.token as string;
}

describe('Project supervisor lookup scoping', () => {
  let admin: SeedRoleUser;
  let wmA: SeedRoleUser;
  let wmNoDept: SeedRoleUser;
  let dmA: SeedRoleUser;

  let supA: SeedRoleUser;
  let supB: SeedRoleUser;
  let supANoDept: SeedRoleUser;

  let deptA: number;
  let deptB: number;
  let whAMain: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    deptA = await seedDepartment();
    deptB = await seedDepartment();
    whAMain = await seedWarehouse({ department_id: deptA, is_main: true });

    admin = await seedRoleUser('system_admin');
    wmA = await seedRoleUser('warehouse_manager', { department_id: deptA, warehouse_ids: [whAMain] });
    wmNoDept = await seedRoleUser('warehouse_manager', { warehouse_ids: [whAMain] });
    dmA = await seedRoleUser('department_manager', { department_id: deptA });

    supA = await seedRoleUser('supervisor', { department_id: deptA });
    supB = await seedRoleUser('supervisor', { department_id: deptB });
    supANoDept = await seedRoleUser('supervisor');

    admin.token = await login(admin);
    wmA.token = await login(wmA);
    wmNoDept.token = await login(wmNoDept);
    dmA.token = await login(dmA);
  });

  afterAll(async () => {
    const userIds = [admin, wmA, wmNoDept, dmA, supA, supB, supANoDept].map((u) => u.id);
    await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [userIds]);
    await pool.query('DELETE FROM user_warehouses WHERE user_id = ANY($1)', [userIds]);
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    await cleanup(prefix);
  });

  describe('SUP-1: warehouse manager sees only their own department supervisors', () => {
    test('returns 200 and contains own-department supervisors', async () => {
      const res = await request(app)
        .get('/api/users/supervisors')
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const ids = res.body.data.map((u: any) => u.id);
      expect(ids).toContain(supA.id);
    });

    test('candidates are role = supervisor only (no Department Head / warehouse manager)', async () => {
      const res = await request(app)
        .get('/api/users/supervisors')
        .set('Authorization', `Bearer ${wmA.token}`);
      const ids = res.body.data.map((u: any) => u.id);
      expect(ids).not.toContain(dmA.id);
      expect(ids).not.toContain(wmA.id);
    });
  });

  describe('SUP-2: warehouse manager cannot see another department supervisors', () => {
    test('returns 200 but excludes foreign-department supervisors', async () => {
      const res = await request(app)
        .get('/api/users/supervisors')
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((u: any) => u.id);
      expect(ids).not.toContain(supB.id);
      expect(ids).not.toContain(supANoDept.id);
    });
  });

  describe('SUP-3: warehouse manager with no department fails closed', () => {
    test('returns 200 with an empty list', async () => {
      const res = await request(app)
        .get('/api/users/supervisors')
        .set('Authorization', `Bearer ${wmNoDept.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('SUP-4: system_admin global scope is unchanged', () => {
    test('returns all supervisors across departments', async () => {
      const res = await request(app)
        .get('/api/users/supervisors')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((u: any) => u.id);
      expect(ids).toContain(supA.id);
      expect(ids).toContain(supB.id);
      expect(ids).toContain(supANoDept.id);
      expect(ids).not.toContain(dmA.id);
    });
  });

  describe('SUP-5: department_manager behavior unchanged (still 403)', () => {
    test('department manager cannot list supervisors', async () => {
      const res = await request(app)
        .get('/api/users/supervisors')
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(403);
    });
  });
});
