import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedWarehouse, seedDepartment, cleanup } from '../helpers';

/**
 * System-managed lifecycle dates for graduation projects.
 *
 *   SD-1  create without start_date/end_date -> start_date is set by the
 *         server, end_date and expected_completion_date stay NULL
 *   SD-2  a client-supplied start_date/end_date cannot override the server
 *         (the API layer strips them; start_date is always server-generated)
 *   SD-3  update cannot change the lifecycle dates
 *   SD-4  close (finish) sets end_date to the server date and status = closed
 *   SD-5  closing an already-closed project returns a conflict and keeps the
 *         original end_date
 *   SD-6  list / detail / student roster still work
 *   SD-7  permissions are unchanged (a department_manager cannot create)
 */
const prefix = `${TEST_PREFIX}sysdates_`;
let app: any;

interface SeedRoleUser {
  id: number;
  username: string;
  password: string;
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
  return { id, username, password, token: '' };
}

async function login(user: SeedRoleUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** DATE columns are returned by pg as Date objects (ISO UTC); normalize to the local calendar date. */
function localDateOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Project system-managed lifecycle dates', () => {
  let admin: SeedRoleUser;
  let supervisor: SeedRoleUser;
  let dm: SeedRoleUser;

  let deptA: number;
  let whMain: number;
  let whA2: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    deptA = await seedDepartment();
    whMain = await seedWarehouse({ department_id: deptA, is_main: true });
    whA2 = await seedWarehouse({ department_id: deptA });

    admin = await seedRoleUser('system_admin');
    supervisor = await seedRoleUser('system_admin', { department_id: deptA });
    dm = await seedRoleUser('department_manager', { department_id: deptA });

    admin.token = await login(admin);
    supervisor.token = await login(supervisor);
    dm.token = await login(dm);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  async function createProject(overrides: Record<string, any> = {}) {
    return request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: `${prefix}project_${shortId()}`,
        department_id: deptA,
        warehouse_id: whA2,
        supervisor_id: supervisor.id,
        academic_year: '2025/2026',
        ...overrides,
      });
  }

  test('SD-1 create without dates -> start_date is server-generated, end_date is NULL', async () => {
    const res = await createProject();
    expect(res.status).toBe(201);
    expect(localDateOf(res.body.data.start_date)).toBe(todayStr());
    expect(res.body.data.end_date).toBeNull();
    expect(res.body.data.expected_completion_date).toBeNull();
  });

  test('SD-2 client-supplied dates cannot override the server on create', async () => {
    const res = await createProject({
      start_date: '2020-01-01',
      expected_completion_date: '2030-01-01',
      end_date: '2031-01-01',
    });
    expect(res.status).toBe(201);
    expect(localDateOf(res.body.data.start_date)).toBe(todayStr());
    expect(localDateOf(res.body.data.start_date)).not.toBe('2020-01-01');
    expect(res.body.data.end_date).toBeNull();
    expect(res.body.data.expected_completion_date).toBeNull();
  });

  test('SD-3 update cannot change the lifecycle dates', async () => {
    const created = await createProject();
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const originalStart = created.body.data.start_date;

    const res = await request(app)
      .patch(`/api/projects/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: `${prefix}renamed`,
        start_date: '2020-01-01',
        expected_completion_date: '2030-01-01',
        end_date: '2031-01-01',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(`${prefix}renamed`);
    expect(res.body.data.start_date).toBe(originalStart);
    expect(localDateOf(res.body.data.start_date)).not.toBe('2020-01-01');
    expect(res.body.data.end_date).toBeNull();
    expect(res.body.data.expected_completion_date).toBeNull();
  });

  test('SD-4 finish (close) -> status closed and end_date is server-generated', async () => {
    const created = await createProject();
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const res = await request(app)
      .patch(`/api/projects/${id}/close`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('closed');
    expect(localDateOf(res.body.data.end_date)).toBe(todayStr());
    expect(res.body.data.closed_at).not.toBeNull();
  });

  test('SD-5 finishing an already-closed project -> conflict and end_date unchanged', async () => {
    const created = await createProject();
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    await request(app).patch(`/api/projects/${id}/close`).set('Authorization', `Bearer ${admin.token}`);

    const before = await request(app).get(`/api/projects/${id}`).set('Authorization', `Bearer ${admin.token}`);
    const endDateBefore = before.body.data.end_date;

    const second = await request(app)
      .patch(`/api/projects/${id}/close`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(second.status).toBe(400);
    expect(second.body.error.message).toContain('already closed');

    const after = await request(app).get(`/api/projects/${id}`).set('Authorization', `Bearer ${admin.token}`);
    expect(after.body.data.end_date).toBe(endDateBefore);
  });

  test('SD-6 list and detail still work (incl. student roster)', async () => {
    const created = await createProject({
      students: [
        { full_name: `${prefix}Student One`, student_id: 'S1', role: 'leader' },
        { full_name: `${prefix}Student Two` },
      ],
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const list = await request(app).get('/api/projects?limit=200').set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((p: any) => p.id === id)).toBe(true);

    const detail = await request(app).get(`/api/projects/${id}/detail`).set('Authorization', `Bearer ${admin.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.students).toHaveLength(2);
    expect(localDateOf(detail.body.data.start_date)).toBe(todayStr());
    expect(detail.body.data.end_date).toBeNull();
  });

  test('SD-7 permissions are unchanged: department_manager cannot create a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${dm.token}`)
      .send({
        name: `${prefix}dm_forbidden`,
        department_id: deptA,
        warehouse_id: whA2,
        supervisor_id: supervisor.id,
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });
});
