import request from 'supertest';
import { PR_TEST_PREFIX, seedPrWorld, login, prTeardown, type PrWorld } from './helpers';

/**
 * Permission matrix: every purchase-requests permission is enforced server-side
 * via the authorize() middleware. supervisor holds no grants at all.
 */
interface Endpoint {
  method: 'get' | 'post' | 'patch';
  path: string;
  perm: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: 'get',    path: '/api/purchase-requests',        perm: 'purchase-requests:view/view_own' },
  { method: 'get',    path: '/api/purchase-requests/1',      perm: 'purchase-requests:view/view_own' },
  { method: 'post',   path: '/api/purchase-requests',        perm: 'purchase-requests:create' },
  { method: 'patch',  path: '/api/purchase-requests/1/cancel', perm: 'purchase-requests:cancel' },
  { method: 'patch',  path: '/api/purchase-requests/1/approve-dept',  perm: 'purchase-requests:approve-dept' },
  { method: 'patch',  path: '/api/purchase-requests/1/reject-dept',   perm: 'purchase-requests:reject-dept' },
  { method: 'patch',  path: '/api/purchase-requests/1/approve-admin', perm: 'purchase-requests:approve-admin' },
  { method: 'patch',  path: '/api/purchase-requests/1/reject-admin',  perm: 'purchase-requests:reject-admin' },
];

describe('Purchase requests — permissions', () => {
  let app: any;
  let world: PrWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPrWorld();
    for (const u of Object.values(world.users)) u.token = await login(app, u);
  });

  afterAll(async () => { await prTeardown(PR_TEST_PREFIX); });

  function hit(method: Endpoint['method'], path: string, token: string, body: Record<string, unknown> = {}) {
    const agent = request(app);
    if (method === 'post') return agent.post(path).set('Authorization', `Bearer ${token}`).send(body);
    if (method === 'patch') return agent.patch(path).set('Authorization', `Bearer ${token}`).send(body);
    return agent.get(path).set('Authorization', `Bearer ${token}`);
  }

  test('supervisor gets 403 on every endpoint (no purchase-requests grants)', async () => {
    for (const ep of ENDPOINTS) {
      const res = await hit(ep.method, ep.path, world.users.supervisor.token, {});
      expect(res.status).toBe(403);
    }
  });

  test('sub_warehouse_manager passes the permission layer on allowed routes (404 on foreign id)', async () => {
    const res = await request(app).get('/api/purchase-requests/99999999')
      .set('Authorization', `Bearer ${world.users.wmA.token}`);
    // permission gate passed; foreign/nonexistent id -> 404, not 403
    expect(res.status).toBe(404);
  });

  test('admin passes the permission layer on the routes it holds (404 on missing id, not 403)', async () => {
    const res404 = await request(app).get('/api/purchase-requests/99999999')
      .set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(res404.status).toBe(404);

    // admin holds approve-admin: a missing request id surfaces as 404 (permission gate passed)
    const resPatch = await hit('patch', '/api/purchase-requests/99999999/approve-admin', world.users.admin.token, {});
    expect(resPatch.status).toBe(404);
  });

  test('admin is NOT a creator — blocked on create (403)', async () => {
    const res = await hit('post', '/api/purchase-requests', world.users.admin.token, { warehouse_id: 1, items: [] });
    expect(res.status).toBe(403);
  });

  test('sub_warehouse_manager blocked on approve-dept / approve-admin / reject-dept / reject-admin (403)', async () => {
    for (const path of ['/1/approve-dept', '/1/reject-dept', '/1/approve-admin', '/1/reject-admin']) {
      const res = await hit('patch', `/api/purchase-requests${path}`, world.users.wmA.token, {});
      expect(res.status).toBe(403);
    }
  });

  test('department_manager blocked on approve-admin / reject-admin / create / cancel (403)', async () => {
    const blocked: Endpoint[] = [
      { method: 'patch', path: '/api/purchase-requests/1/approve-admin', perm: '' },
      { method: 'patch', path: '/api/purchase-requests/1/reject-admin', perm: '' },
      { method: 'post',  path: '/api/purchase-requests', perm: '' },
      { method: 'patch', path: '/api/purchase-requests/1/cancel', perm: '' },
    ];
    for (const ep of blocked) {
      const res = await hit(ep.method, ep.path, world.users.deptMgrA.token, {});
      expect(res.status).toBe(403);
    }
  });

  test('permission catalog seeded exactly once per role in DB', async () => {
    const { pool } = await import('../../src/config/database');

    const subWmPerms = await pool.query(
      `SELECT p.code FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code = 'sub_warehouse_manager' AND p.code LIKE 'purchase-requests:%'
       ORDER BY p.code`
    );
    expect(subWmPerms.rows.map(r => r.code)).toEqual([
      'purchase-requests:cancel',
      'purchase-requests:create',
      'purchase-requests:view_own',
    ]);

    const deptMgrPerms = await pool.query(
      `SELECT p.code FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code = 'department_manager' AND p.code LIKE 'purchase-requests:%'
       ORDER BY p.code`
    );
    expect(deptMgrPerms.rows.map(r => r.code)).toEqual([
      'purchase-requests:approve-dept',
      'purchase-requests:reject-dept',
      'purchase-requests:view',
    ]);

    const adminPerms = await pool.query(
      `SELECT p.code FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code = 'admin' AND p.code LIKE 'purchase-requests:%'
       ORDER BY p.code`
    );
    expect(adminPerms.rows.map(r => r.code)).toEqual([
      'purchase-requests:approve-admin',
      'purchase-requests:reject-admin',
      'purchase-requests:view',
    ]);

    const sup = await pool.query(
      `SELECT count(*)::int AS n FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code = 'supervisor' AND p.code LIKE 'purchase-requests:%'`
    );
    expect(sup.rows[0].n).toBe(0);
  });
});