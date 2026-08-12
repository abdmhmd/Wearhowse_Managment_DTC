import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedWarehouse, seedDepartment, cleanup } from '../helpers';

/**
 * Project & Warehouse Manager permissions:
 *
 *   WM-1  a warehouse_manager can only create projects in their own department
 *         (department_id is derived server-side, never trusted from the client)
 *   WM-2  a warehouse_manager can only create projects for an assigned warehouse
 *   WM-3  a warehouse_manager omitting the warehouse defaults to one of their
 *         assigned warehouses of the department (preferring the main warehouse)
 *   WM-4  a warehouse_manager list/read is scoped to their assigned department
 *   DM-1  a department_manager is VIEW-ONLY: cannot edit the student roster or
 *         project metadata (projects:update revoked by migration 028 -> 403)
 *   DM-2  a department_manager cannot change the project warehouse (403)
 *   DM-3  a department_manager cannot create/close/cancel projects
 *   DM-4  a department_manager list/read is scoped to their own department;
 *         without a department the list is empty (fail-closed)
 *   G-1   system_admin is unchanged (GLOBAL scope)
 */
const prefix = `${TEST_PREFIX}projperm_`;
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

describe('Project & warehouse manager permissions', () => {
  let admin: SeedRoleUser;
  let wmA: SeedRoleUser;
  let wmB: SeedRoleUser;
  let wmNoDept: SeedRoleUser;
  let dmA: SeedRoleUser;
  let dmNoDept: SeedRoleUser;
  let supervisorA: SeedRoleUser;

  let deptA: number;
  let deptB: number;
  let whAMain: number;
  let whA2: number;
  let whBMain: number;

  let deptAProject: number;
  let deptBProject: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    deptA = await seedDepartment();
    deptB = await seedDepartment();
    whAMain = await seedWarehouse({ department_id: deptA, is_main: true });
    whA2 = await seedWarehouse({ department_id: deptA });
    whBMain = await seedWarehouse({ department_id: deptB, is_main: true });

    admin = await seedRoleUser('system_admin');
    wmA = await seedRoleUser('warehouse_manager', { department_id: deptA, warehouse_ids: [whA2, whAMain] });
    wmB = await seedRoleUser('warehouse_manager', { department_id: deptB, warehouse_ids: [whBMain] });
    wmNoDept = await seedRoleUser('warehouse_manager', { warehouse_ids: [whAMain] });
    dmA = await seedRoleUser('department_manager', { department_id: deptA });
    dmNoDept = await seedRoleUser('department_manager');
    supervisorA = await seedRoleUser('system_admin', { department_id: deptA });

    admin.token = await login(admin);
    wmA.token = await login(wmA);
    wmB.token = await login(wmB);
    wmNoDept.token = await login(wmNoDept);
    dmA.token = await login(dmA);
    dmNoDept.token = await login(dmNoDept);

    // Control data created by the system admin (GLOBAL scope, unchanged).
    const pA = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: `${prefix}A`, department_id: deptA, supervisor_id: supervisorA.id, warehouse_id: whA2 });
    expect(pA.status).toBe(201);
    deptAProject = pA.body.data.id;

    const pB = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: `${prefix}B`, department_id: deptB, supervisor_id: supervisorA.id, warehouse_id: whBMain });
    expect(pB.status).toBe(201);
    deptBProject = pB.body.data.id;
  });

  afterAll(async () => {
    const userIds = [admin, wmA, wmB, wmNoDept, dmA, dmNoDept, supervisorA].map((u) => u.id);
    await pool.query(
      `DELETE FROM audit_logs WHERE user_id = ANY($1)`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM projects WHERE created_by = ANY($1) OR supervisor_id = ANY($1)`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM user_warehouses WHERE user_id = ANY($1)`,
      [userIds]
    );
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    await cleanup(prefix);
  });

  describe('WM-1: warehouse manager can only create projects in their own department', () => {
    test('create with a foreign department_id is rejected (400)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${wmA.token}`)
        .send({ name: `${prefix}bad_dept`, department_id: deptB, supervisor_id: supervisorA.id, warehouse_id: whBMain });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('a warehouse manager without a department cannot create (400)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${wmNoDept.token}`)
        .send({ name: `${prefix}no_dept`, department_id: deptA, supervisor_id: supervisorA.id, warehouse_id: whAMain });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('WM-2: warehouse manager can only create projects for an assigned warehouse', () => {
    test('create with a non-assigned warehouse is rejected (400)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${wmB.token}`)
        .send({ name: `${prefix}bad_wh`, department_id: deptB, supervisor_id: supervisorA.id, warehouse_id: whAMain });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('create with an assigned warehouse of the department succeeds', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${wmA.token}`)
        .send({ name: `${prefix}ok_wh`, department_id: deptA, supervisor_id: supervisorA.id, warehouse_id: whA2 });
      expect(res.status).toBe(201);
      expect(res.body.data.department_id).toBe(deptA);
      expect(res.body.data.warehouse_id).toBe(whA2);
    });
  });

  describe('WM-3: warehouse manager omitting the warehouse defaults to an assigned one', () => {
    test('create without warehouse_id picks an assigned warehouse (main preferred)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${wmA.token}`)
        .send({ name: `${prefix}auto_wh`, department_id: deptA, supervisor_id: supervisorA.id });
      expect(res.status).toBe(201);
      expect(res.body.data.department_id).toBe(deptA);
      expect([whAMain, whA2]).toContain(res.body.data.warehouse_id);
      expect(res.body.data.warehouse_id).toBe(whAMain);
    });
  });

  describe('WM-4: warehouse manager list/read is scoped to their assigned department', () => {
    test('list does not include projects of other departments', async () => {
      const res = await request(app)
        .get('/api/projects?limit=200')
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((x: any) => x.id);
      expect(ids).toContain(deptAProject);
      expect(ids).not.toContain(deptBProject);
    });

    test('getById of a foreign project returns 404', async () => {
      const res = await request(app)
        .get(`/api/projects/${deptBProject}`)
        .set('Authorization', `Bearer ${wmA.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('DM-1: department manager is view-only (projects:update revoked)', () => {
    test('department manager cannot PUT students on their own department project (403)', async () => {
      const res = await request(app)
        .put(`/api/projects/${deptAProject}/students`)
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ students: [{ full_name: 'Student One' }, { full_name: 'Student Two' }] });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });
  });

  describe('DM-2: department manager cannot edit any project field', () => {
    test('PATCH /projects/:id with a different warehouse_id returns 403', async () => {
      const res = await request(app)
        .patch(`/api/projects/${deptAProject}`)
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ warehouse_id: whAMain });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    test('PATCH /projects/:id metadata (name) also returns 403', async () => {
      const res = await request(app)
        .patch(`/api/projects/${deptAProject}`)
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ name: `${prefix}A renamed` });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });
  });

  describe('DM-3: department manager cannot create/close/cancel projects', () => {
    test('create is forbidden (403)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${dmA.token}`)
        .send({ name: `${prefix}dm_create`, department_id: deptA, supervisor_id: supervisorA.id });
      expect(res.status).toBe(403);
    });

    test('close is forbidden (403)', async () => {
      const res = await request(app)
        .patch(`/api/projects/${deptAProject}/close`)
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(403);
    });

    test('cancel is forbidden (403)', async () => {
      const res = await request(app)
        .patch(`/api/projects/${deptAProject}/cancel`)
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('DM-4: department manager view is scoped to their own department', () => {
    test('list only contains projects of their own department', async () => {
      const res = await request(app)
        .get('/api/projects?limit=200')
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((x: any) => x.id);
      expect(ids).toContain(deptAProject);
      expect(ids).not.toContain(deptBProject);
    });

    test('getById of a foreign-department project returns 404', async () => {
      const res = await request(app)
        .get(`/api/projects/${deptBProject}`)
        .set('Authorization', `Bearer ${dmA.token}`);
      expect(res.status).toBe(404);
    });

    test('department manager without a department gets an empty list (fail-closed)', async () => {
      const res = await request(app)
        .get('/api/projects?limit=200')
        .set('Authorization', `Bearer ${dmNoDept.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });
  });

  describe('G-1: system_admin is unchanged (GLOBAL scope)', () => {
    test('admin can create a project in any department', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: `${prefix}admin_global`, department_id: deptB, supervisor_id: supervisorA.id, warehouse_id: whBMain });
      expect(res.status).toBe(201);
      expect(res.body.data.department_id).toBe(deptB);
    });

    test('admin sees projects from every department', async () => {
      const res = await request(app)
        .get('/api/projects?limit=200')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((x: any) => x.id);
      expect(ids).toContain(deptAProject);
      expect(ids).toContain(deptBProject);
    });
  });
});
