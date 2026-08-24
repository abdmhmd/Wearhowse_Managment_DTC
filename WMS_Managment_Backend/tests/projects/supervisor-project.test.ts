import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Supervisor graduation-project management (backend enforcement):
 *
 * A `supervisor` can create graduation projects, but EVERY project they create
 * is automatically assigned to THEMSELVES (supervisor_id = authenticated user,
 * never the payload). Existing scoping (projects.repository.findAll +
 * ProjectsService.inScope) restricts list/detail/update/delete to
 * `supervisor_id = user.id`.
 *
 *   S1  create (supervisor_id omitted)                     -> 201, owned by self
 *   S2  create (supervisor_id = self)                      -> 201
 *   S3  forged supervisor_id of ANOTHER supervisor         -> 400 (rejected)
 *   S4  list scopes to OWN projects only
 *   S5  getById: own 200, another supervisor's project 404
 *   S6  update: own 200, another supervisor's project 404
 *   S7  supervisor cannot transfer ownership (update supervisor_id) -> 400
 *   S8  delete: own 200 (deactivated), another supervisor's project 404
 *   S9  supervisor uses OWN project in a material request  -> 201
 *   S10 supervisor material request with another's project -> 400 (rejected)
 *   R1  regression: system_admin creates project for any supervisor -> 201
 *   R2  regression: warehouse_manager creates project in own dept -> 201
 *   R3  regression: department_manager still cannot create projects (403)
 */
const prefix = `${TEST_PREFIX}supProj_`;
let app: any;

interface SeedRoleUser {
  id: number;
  username: string;
  password: string;
  token: string;
}

async function seedRoleUser(role: string, opts: { department_id?: number | null; warehouse_ids?: number[] } = {}): Promise<SeedRoleUser> {
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
  return { id, username, password, token: '' };
}

async function login(user: SeedRoleUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

function createProject(
  token: string,
  body: Record<string, unknown>
) {
  return request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('Supervisor graduation-project management', () => {
  let admin: SeedRoleUser;
  let supA: SeedRoleUser;
  let supB: SeedRoleUser;
  let wmA: SeedRoleUser;
  let dmA: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whA: number;
  let whB: number;
  let itemId: number;

  let ownProject: number;
  let supBProject: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptA = await seedDepartment();
    deptB = await seedDepartment();
    await seedWarehouse({ department_id: deptA, is_main: true });
    await seedWarehouse({ department_id: deptB, is_main: true });
    whA = await seedWarehouse({ department_id: deptA });
    whB = await seedWarehouse({ department_id: deptB });
    itemId = await seedItem(catCode, unitCode, whA, 100);

    admin = await seedRoleUser('system_admin');
    supA = await seedRoleUser('supervisor', { department_id: deptA });
    supB = await seedRoleUser('supervisor', { department_id: deptA });
    wmA = await seedRoleUser('warehouse_manager', { department_id: deptA, warehouse_ids: [whA] });
    dmA = await seedRoleUser('department_manager', { department_id: deptA });

    admin.token = await login(admin);
    supA.token = await login(supA);
    supB.token = await login(supB);
    wmA.token = await login(wmA);
    dmA.token = await login(dmA);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  test('S1: supervisor creates a project (supervisor_id omitted) -> 201, owned by self', async () => {
    const res = await createProject(supA.token, {
      name: `${prefix}own1_${shortId()}`,
      department_id: deptA,
      warehouse_id: whA,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.supervisor_id).toBe(supA.id);
    expect(res.body.data.department_id).toBe(deptA);
    ownProject = res.body.data.id;

    const row = await pool.query(
      'SELECT supervisor_id, department_id, created_by FROM projects WHERE id = $1',
      [ownProject]
    );
    expect(row.rows[0].supervisor_id).toBe(supA.id);
    expect(row.rows[0].department_id).toBe(deptA);
    expect(row.rows[0].created_by).toBe(supA.id);
  });

  test('S2: supervisor creates a project with supervisor_id = self -> 201', async () => {
    const res = await createProject(supA.token, {
      name: `${prefix}own2_${shortId()}`,
      department_id: deptA,
      supervisor_id: supA.id,
      warehouse_id: whA,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.supervisor_id).toBe(supA.id);
  });

  test('S3: forged supervisor_id of ANOTHER supervisor -> 400 (rejected)', async () => {
    const res = await createProject(supA.token, {
      name: `${prefix}forged_${shortId()}`,
      department_id: deptA,
      supervisor_id: supB.id,
      warehouse_id: whA,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/only create projects assigned to themselves/i);

    // No project row may have been created for supB by this call.
    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM projects WHERE supervisor_id = $1 AND name LIKE $2',
      [supB.id, `${prefix}forged_%`]
    );
    expect(count.rows[0].n).toBe(0);
  });

  test('S4: supervisor list scopes to OWN projects only', async () => {
    // Control: another supervisor's project created by the admin in the SAME
    // department — must NOT appear in supA's list.
    const foreign = await createProject(admin.token, {
      name: `${prefix}supB_${shortId()}`,
      department_id: deptA,
      supervisor_id: supB.id,
      warehouse_id: whA,
    });
    expect(foreign.status).toBe(201);
    supBProject = foreign.body.data.id;

    const res = await request(app)
      .get('/api/projects?limit=200')
      .set('Authorization', `Bearer ${supA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((x: any) => x.id);
    expect(ids).toContain(ownProject);
    expect(ids).not.toContain(supBProject);
  });

  test('S5: supervisor getById — own project 200, another supervisor\'s project 404', async () => {
    const own = await request(app)
      .get(`/api/projects/${ownProject}`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(own.status).toBe(200);
    expect(own.body.data.supervisor_id).toBe(supA.id);

    const foreign = await request(app)
      .get(`/api/projects/${supBProject}`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  test('S6: supervisor update — own project 200, another supervisor\'s project 404', async () => {
    const own = await request(app)
      .patch(`/api/projects/${ownProject}`)
      .set('Authorization', `Bearer ${supA.token}`)
      .send({ name: `${prefix}own_renamed_${shortId()}` });
    expect(own.status).toBe(200);
    expect(own.body.data.name).toContain('own_renamed');

    const foreign = await request(app)
      .patch(`/api/projects/${supBProject}`)
      .set('Authorization', `Bearer ${supA.token}`)
      .send({ name: `${prefix}hack_${shortId()}` });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('PROJECT_NOT_FOUND');

    const row = await pool.query(
      'SELECT name FROM projects WHERE id = $1',
      [supBProject]
    );
    expect(row.rows[0].name).not.toContain('hack');
  });

  test('S7: supervisor cannot transfer ownership via update (supervisor_id) -> 400', async () => {
    const res = await request(app)
      .patch(`/api/projects/${ownProject}`)
      .set('Authorization', `Bearer ${supA.token}`)
      .send({ supervisor_id: supB.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/cannot change the project supervisor/i);

    const row = await pool.query(
      'SELECT supervisor_id FROM projects WHERE id = $1',
      [ownProject]
    );
    expect(row.rows[0].supervisor_id).toBe(supA.id);
  });

  test('S8: supervisor delete — own project 200 (deactivated), another supervisor\'s project 404', async () => {
    const own = await request(app)
      .delete(`/api/projects/${ownProject}`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(own.status).toBe(200);

    const row = await pool.query(
      'SELECT is_active FROM projects WHERE id = $1',
      [ownProject]
    );
    expect(row.rows[0].is_active).toBe(false);

    const foreign = await request(app)
      .delete(`/api/projects/${supBProject}`)
      .set('Authorization', `Bearer ${supA.token}`);
    expect(foreign.status).toBe(404);
  });

  test('S9: supervisor uses OWN project in a material request -> 201', async () => {
    const project = await createProject(supA.token, {
      name: `${prefix}req_own_${shortId()}`,
      department_id: deptA,
      warehouse_id: whA,
    });
    expect(project.status).toBe(201);

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${supA.token}`)
      .send({
        request_type: 'project',
        priority: 'normal',
        warehouse_id: whA,
        project_id: project.body.data.id,
        items: [{ item_id: itemId, quantity: 1, unit_code: unitCode }],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.project_id).toBe(project.body.data.id);
    expect(res.body.data.requested_by).toBe(supA.id);
  });

  test('S10: supervisor material request with ANOTHER supervisor\'s project -> 400 (rejected)', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${supA.token}`)
      .send({
        request_type: 'project',
        priority: 'normal',
        warehouse_id: whA,
        project_id: supBProject,
        items: [{ item_id: itemId, quantity: 1, unit_code: unitCode }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/project you supervise/i);
  });

  test('R1: regression — system_admin creates a project for any supervisor -> 201', async () => {
    const res = await createProject(admin.token, {
      name: `${prefix}admin_${shortId()}`,
      department_id: deptB,
      supervisor_id: supB.id,
      warehouse_id: whB,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.department_id).toBe(deptB);
    expect(res.body.data.supervisor_id).toBe(supB.id);
  });

  test('R2: regression — warehouse_manager creates a project in own department -> 201', async () => {
    const res = await createProject(wmA.token, {
      name: `${prefix}wm_${shortId()}`,
      department_id: deptA,
      supervisor_id: supA.id,
      warehouse_id: whA,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.department_id).toBe(deptA);
    expect(res.body.data.supervisor_id).toBe(supA.id);
  });

  test('R3: regression — department_manager still cannot create projects (403)', async () => {
    const res = await createProject(dmA.token, {
      name: `${prefix}dm_${shortId()}`,
      department_id: deptA,
      supervisor_id: supA.id,
      warehouse_id: whA,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });
});
