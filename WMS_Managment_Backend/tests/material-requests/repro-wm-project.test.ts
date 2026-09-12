import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * REPRO: sub_warehouse_manager creates a material issue request for a graduation
 * project. Mirrors the exact frontend payload.
 */
const prefix = `${TEST_PREFIX}reproproj_`;
let app: any;

async function seedProject(deptId: number, warehouseId: number, createdBy: number, supervisorId: number, status = 'open') {
  const name = `${prefix}project_${shortId()}`;
  const res = await pool.query(
    `INSERT INTO projects (project_no, name, department_id, warehouse_id, supervisor_id, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [`PRJ-${shortId()}`, name, deptId, warehouseId, supervisorId, createdBy, status]
  );
  return res.rows[0].id;
}

interface SeedRoleUser { id: number; username: string; password: string;   token: string; }

async function seedRoleUser(role: string, opts: { department_id?: number | null; warehouse_ids?: number[] } = {}): Promise<SeedRoleUser> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${prefix}user_${shortId()}`;
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

async function login(user: { username: string; password: string }): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

function createProjectRequest(
  token: string,
  opts: { request_type: string; project_id: number | null; department_id: number; warehouse_id: number; items: Array<{ item_id: number; quantity: number; unit_code: string }> }
) {
  return request(app)
    .post('/api/requests')
    .set('Authorization', `Bearer ${token}`)
    .send({
      department_id: opts.department_id,
      warehouse_id: opts.warehouse_id,
      request_type: opts.request_type,
      project_id: opts.project_id,
      priority: 'normal',
      notes: `${prefix}note_${shortId()}`,
      items: opts.items,
    });
}

describe('REPRO: WM creates a material issue request for a graduation project', () => {
  let wmAssigned: SeedRoleUser;
  let wmMainOnly: SeedRoleUser;
  let wmZero: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whA: number;
  let whB: number;
  let whMain: number;
  let itemId: number;
  let projectA: number;
  let projectB: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    deptB = await seedDepartment();
    whA = await seedWarehouse({ department_id: deptA });
    whB = await seedWarehouse({ department_id: deptB });
    whMain = await seedWarehouse({ department_id: deptA, is_main: true });
    itemId = await seedItem(catCode, unitCode, whA, 100);

    wmAssigned = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whA] });
    wmMainOnly = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whMain] });
    wmZero = await seedRoleUser('sub_warehouse_manager');

    projectA = await seedProject(deptA, whA, wmAssigned.id, wmAssigned.id);
    projectB = await seedProject(deptB, whB, wmAssigned.id, wmAssigned.id);

    wmAssigned.token = await login(wmAssigned);
    wmMainOnly.token = await login(wmMainOnly);
    wmZero.token = await login(wmZero);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  const items = () => [{ item_id: itemId, quantity: 1, unit_code: unitCode }];

  test('S1 baseline: WM with valid assigned warehouse + own-department project -> expect 201', async () => {
    const res = await createProjectRequest(wmAssigned.token, {
      request_type: 'project',
      project_id: projectA,
      department_id: deptA,
      warehouse_id: whA,
      items: items(),
    });
    console.log('S1 status:', res.status, 'body:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(res.body.data.request_type).toBe('project');
    expect(res.body.data.project_id).toBe(projectA);
  });

  test('S2 WM assigned ONLY to main warehouse + project request -> observe status', async () => {
    const res = await createProjectRequest(wmMainOnly.token, {
      request_type: 'project',
      project_id: projectA,
      department_id: deptA,
      warehouse_id: whA,
      items: items(),
    });
    console.log('S2 status:', res.status, 'body:', JSON.stringify(res.body));
  });

  test('S3 WM zero-assignments (fallback) + project + warehouse selection -> observe status', async () => {
    const res = await createProjectRequest(wmZero.token, {
      request_type: 'project',
      project_id: projectA,
      department_id: deptA,
      warehouse_id: whA,
      items: items(),
    });
    console.log('S3 status:', res.status, 'body:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
  });

  test('S4 WM + project from ANOTHER department -> rejected with PROJECT_DEPARTMENT_MISMATCH', async () => {
    const res = await createProjectRequest(wmAssigned.token, {
      request_type: 'project',
      project_id: projectB,
      department_id: deptA,
      warehouse_id: whA,
      items: items(),
    });
    console.log('S4 status:', res.status, 'body:', JSON.stringify(res.body));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROJECT_DEPARTMENT_MISMATCH');
  });

  test('S5 needed_by = today -> allowed (201)', async () => {
    // Build "today" in the SERVER's local timezone: the validator compares the
    // date against server-local midnight. A UTC-sourced (toISOString) "today"
    // can become "yesterday" when the server TZ is behind UTC.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${wmAssigned.token}`)
      .send({
        department_id: deptA,
        warehouse_id: whA,
        request_type: 'experiment',
        priority: 'normal',
        needed_by: today,
        notes: `${prefix}note_${shortId()}`,
        items: items(),
      });
    console.log('S5 status:', res.status, 'body:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
  });

  test('S6 needed_by = yesterday -> rejected (400)', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${wmAssigned.token}`)
      .send({
        department_id: deptA,
        warehouse_id: whA,
        request_type: 'experiment',
        priority: 'normal',
        needed_by: yesterday,
        notes: `${prefix}note_${shortId()}`,
        items: items(),
      });
    console.log('S6 status:', res.status, 'body:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('needed_by');
  });

  test('S7 project that is not open -> rejected (400)', async () => {
    const closedProject = await seedProject(deptA, whA, wmAssigned.id, wmAssigned.id, 'closed');
    const res = await createProjectRequest(wmAssigned.token, {
      request_type: 'project',
      project_id: closedProject,
      department_id: deptA,
      warehouse_id: whA,
      items: items(),
    });
    console.log('S7 status:', res.status, 'body:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not open');
  });
});
