import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedDepartment, cleanup } from '../helpers';

/**
 * GET/POST/PATCH/DELETE /api/supervisors — Supervisors Management for the
 * Department Head dashboard.
 *
 * A supervisor is a user with role `supervisor`. The actor (Department Head)
 * has role `department_manager` and manages ONLY the supervisors of their own
 * department. The `department_manager` role is reserved for Department Heads
 * and must never appear in the supervisor list:
 *
 *   SUP-M1  a department_manager sees only their own department's supervisors
 *   SUP-M2  the list includes inactive supervisors (re-activation workflow)
 *   SUP-M3  a department_manager with no department gets an empty list
 *   SUP-M4  create forces the role to `supervisor` and the department to the
 *           actor's own (payload is ignored)
 *   SUP-M5  create without a department is rejected
 *   SUP-M6  create rejects a duplicate username
 *   SUP-M7  update works for own-department supervisors
 *   SUP-M8  update of another department's supervisor -> 404
 *   SUP-M9  role / department_id in an update payload are stripped
 *   SUP-M10 a department_manager is not a supervisor record (own id -> 404)
 *   SUP-M11 delete works for own-department supervisors; a department_manager's
 *           own id is not a supervisor record (404)
 *   SUP-M12 admin sees all departments and can scope creates
 *   SUP-M13 sub_warehouse_manager has no access to /api/supervisors (403)
 *   SUP-M14 unauthenticated access is rejected (401)
 *   SUP-M15 department_manager users remain department_manager (never converted)
 */
const prefix = `${TEST_PREFIX}supmgmt_`;
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
  opts: { department_id?: number | null } = {}
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
  return { id, username, password, role, token: '' };
}

async function login(user: SeedRoleUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

describe('Supervisors management', () => {
  let admin: SeedRoleUser;
  let dmA: SeedRoleUser;
  let dmNoDept: SeedRoleUser;
  let wmA: SeedRoleUser;

  let supA1: SeedRoleUser;
  let supA2: SeedRoleUser;
  let supB: SeedRoleUser;
  let supAInactive: SeedRoleUser;

  let deptA: number;
  let deptB: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    deptA = await seedDepartment();
    deptB = await seedDepartment();

    admin = await seedRoleUser('admin');
    dmA = await seedRoleUser('department_manager', { department_id: deptA });
    dmNoDept = await seedRoleUser('department_manager');
    wmA = await seedRoleUser('sub_warehouse_manager', { department_id: deptA });

    supA1 = await seedRoleUser('supervisor', { department_id: deptA });
    supA2 = await seedRoleUser('supervisor', { department_id: deptA });
    supB = await seedRoleUser('supervisor', { department_id: deptB });
    supAInactive = await seedRoleUser('supervisor', { department_id: deptA });
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [supAInactive.id]);

    admin.token = await login(admin);
    dmA.token = await login(dmA);
    dmNoDept.token = await login(dmNoDept);
    wmA.token = await login(wmA);
  });

  afterAll(async () => {
    const userIds = [admin, dmA, dmNoDept, wmA, supA1, supA2, supB, supAInactive].map((u) => u.id);
    await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [userIds]);
    await pool.query('DELETE FROM user_warehouses WHERE user_id = ANY($1)', [userIds]);
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    await cleanup(prefix);
  });

  describe('SUP-M1: department manager sees only their own department', () => {
    test('returns own-department supervisors only', async () => {
      const res = await request(app)
        .get('/api/supervisors')
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((u: any) => u.id);
      expect(ids).toContain(supA1.id);
      expect(ids).toContain(supA2.id);
      expect(ids).not.toContain(supB.id);
    });

    test('a department_manager (Department Head) is not a supervisor', async () => {
      const res = await request(app)
        .get('/api/supervisors')
        .set('Authorization', `Bearer ${dmA.token}`);
      const ids = res.body.data.items.map((u: any) => u.id);
      expect(ids).not.toContain(dmA.id);
    });
  });

  describe('SUP-M2: list includes inactive supervisors', () => {
    test('inactive supervisors appear for re-activation', async () => {
      const res = await request(app)
        .get('/api/supervisors')
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(200);
      const found = res.body.data.items.find((u: any) => u.id === supAInactive.id);
      expect(found).toBeDefined();
      expect(found.is_active).toBe(false);
    });
  });

  describe('SUP-M3: department manager without a department fails closed', () => {
    test('returns an empty list', async () => {
      const res = await request(app)
        .get('/api/supervisors')
        .set('Authorization', `Bearer ${dmNoDept.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });

  describe('SUP-M4: create forces the role to supervisor and the actor department', () => {
    test('payload department_id is ignored for a department manager', async () => {
      const username = `${prefix}new_${shortId()}`;
      const res = await request(app)
        .post('/api/supervisors')
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ username, password: 'testPass123', full_name: 'New Sup', department_id: deptB });
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('supervisor');
      expect(res.body.data.department_id).toBe(deptA);
    });

    test('the created user row has role = supervisor', async () => {
      const username = `${prefix}newdb_${shortId()}`;
      const res = await request(app)
        .post('/api/supervisors')
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ username, password: 'testPass123', full_name: 'New Sup DB' });
      expect(res.status).toBe(201);
      const row = await pool.query('SELECT role FROM users WHERE id = $1', [res.body.data.id]);
      expect(row.rows[0].role).toBe('supervisor');
    });
  });

  describe('SUP-M5: create without a department is rejected', () => {
    test('department manager with no department cannot create', async () => {
      const res = await request(app)
        .post('/api/supervisors')
        .set('Authorization', `Bearer ${dmNoDept.token}`)
        .send({ username: `${prefix}x_${shortId()}`, password: 'testPass123', full_name: 'X' });
      expect(res.status).toBe(400);
    });
  });

  describe('SUP-M6: duplicate username is rejected', () => {
    test('create with an existing username returns 400', async () => {
      const res = await request(app)
        .post('/api/supervisors')
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ username: supA1.username, password: 'testPass123', full_name: 'Dup' });
      expect(res.status).toBe(400);
    });
  });

  describe('SUP-M7: update works for own-department supervisors', () => {
    test('renames and deactivates a colleague', async () => {
      const res = await request(app)
        .patch(`/api/supervisors/${supA1.id}`)
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ full_name: 'Renamed', is_active: false });
      expect(res.status).toBe(200);
      expect(res.body.data.full_name).toBe('Renamed');
      expect(res.body.data.is_active).toBe(false);
    });
  });

  describe('SUP-M8: update of another department is hidden', () => {
    test('returns 404 for a foreign-department supervisor', async () => {
      const res = await request(app)
        .patch(`/api/supervisors/${supB.id}`)
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ full_name: 'Nope' });
      expect(res.status).toBe(404);
    });
  });

  describe('SUP-M9: role / department_id cannot be smuggled through update', () => {
    test('update payload with role/department_id is stripped', async () => {
      const before = await request(app)
        .get('/api/supervisors')
        .set('Authorization', `Bearer ${dmA.token}`);
      const target = before.body.data.items.find((u: any) => u.id === supA2.id);

      const res = await request(app)
        .patch(`/api/supervisors/${supA2.id}`)
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ role: 'admin', department_id: deptB, full_name: 'Stripped' });
      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('supervisor');
      expect(res.body.data.department_id).toBe(target.department_id);
    });
  });

  describe('SUP-M10: a department_manager is not a supervisor record', () => {
    test('patching the own Department Head id returns 404', async () => {
      const res = await request(app)
        .patch(`/api/supervisors/${dmA.id}`)
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ is_active: false });
      expect(res.status).toBe(404);
    });
  });

  describe('SUP-M11: delete scoping and self-id isolation', () => {
    test('cannot delete another department supervisor (404)', async () => {
      const res = await request(app)
        .delete(`/api/supervisors/${supB.id}`)
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(404);
    });

    test('the own Department Head id is not a supervisor record (404)', async () => {
      const res = await request(app)
        .delete(`/api/supervisors/${dmA.id}`)
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(404);
    });

    test('deletes an own-department supervisor', async () => {
      const res = await request(app)
        .delete(`/api/supervisors/${supA2.id}`)
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(false);
    });
  });

  describe('SUP-M12: admin has global scope', () => {
    test('sees supervisors of every department', async () => {
      const res = await request(app)
        .get('/api/supervisors')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((u: any) => u.id);
      expect(ids).toContain(supA1.id);
      expect(ids).toContain(supB.id);
    });

    test('can create a supervisor for a chosen department', async () => {
      const username = `${prefix}adm_${shortId()}`;
      const res = await request(app)
        .post('/api/supervisors')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ username, password: 'testPass123', full_name: 'Admin Sup', department_id: deptB });
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('supervisor');
      expect(res.body.data.department_id).toBe(deptB);
    });
  });

  describe('SUP-M13: sub_warehouse_manager has no access', () => {
    test('GET /api/supervisors returns 403', async () => {
      const res = await request(app)
        .get('/api/supervisors')
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(403);
    });

    test('POST /api/supervisors returns 403', async () => {
      const res = await request(app)
        .post('/api/supervisors')
        .set('Authorization', `Bearer ${wmA.token}`)
        .send({ username: `${prefix}w_${shortId()}`, password: 'testPass123', full_name: 'W' });
      expect(res.status).toBe(403);
    });
  });

  describe('SUP-M14: unauthenticated access', () => {
    test('GET /api/supervisors returns 401', async () => {
      const res = await request(app).get('/api/supervisors');
      expect(res.status).toBe(401);
    });
  });

  describe('SUP-M15: department_manager users remain department_manager', () => {
    test('Department Heads are never converted to supervisor', async () => {
      const rows = await pool.query(
        "SELECT role FROM users WHERE id = ANY($1)",
        [[dmA.id, dmNoDept.id]]
      );
      const roles = rows.rows.map((r) => r.role);
      expect(roles).toEqual(['department_manager', 'department_manager']);
    });
  });
});
