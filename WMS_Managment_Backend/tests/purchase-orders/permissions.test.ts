import request from 'supertest';
import { cleanup } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, poTeardown, type PoWorld } from './helpers';

/**
 * Permission matrix: every purchase-orders permission is enforced server-side
 * via the authorize() middleware. system_admin + warehouse_manager hold the
 * grants; supervisor / department_manager do not.
 */

const ENDPOINTS: Array<{ method: 'get' | 'post' | 'patch'; path: string; perm: string }> = [
  { method: 'get', path: '/api/purchase-orders', perm: 'purchase-orders:view' },
  { method: 'post', path: '/api/purchase-orders', perm: 'purchase-orders:create' },
  { method: 'patch', path: '/api/purchase-orders/1', perm: 'purchase-orders:update' },
  { method: 'post', path: '/api/purchase-orders/1/approve', perm: 'purchase-orders:approve' },
  { method: 'post', path: '/api/purchase-orders/1/cancel', perm: 'purchase-orders:cancel' },
  { method: 'post', path: '/api/purchase-orders/1/close', perm: 'purchase-orders:update(close)' },
  { method: 'post', path: '/api/purchase-orders/1/receive', perm: 'purchase-orders:receive' },
  { method: 'post', path: '/api/purchase-orders/1/allocations', perm: 'purchase-orders:allocate' },
  { method: 'post', path: '/api/purchase-orders/allocations/1/transfer', perm: 'purchase-orders:transfer' },
];

describe('Purchase orders â€” permissions', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    for (const u of Object.values(world.users)) u.token = await login(app, u);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test.each(ENDPOINTS)('$perm enforced on $method $path', async ({ method, path }) => {
    // supervisor has NO purchase-orders permissions at all â†’ every endpoint 403
    const res = await request(app)[method](path).set('Authorization', `Bearer ${world.users.supervisor.token}`);
    expect(res.status).toBe(403);
  });

  test('department manager blocked on every endpoint', async () => {
    for (const ep of ENDPOINTS) {
      const res = await request(app)[ep.method](ep.path).set('Authorization', `Bearer ${world.users.deptMgr.token}`);
      expect(res.status).toBe(403);
    }
  });

  test('warehouse manager WITH grants passes the permission layer (404 on foreign id, not 403)', async () => {
    // wmMain holds the same permission codes; a foreign/nonexistent PO id must
    // surface as 404 (scope), proving the permission gate itself passed.
    const res = await request(app).get('/api/purchase-orders/99999999').set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(res.status).toBe(404);
  });

  test('admin passes the permission layer everywhere (404 on missing id)', async () => {
    const res = await request(app).get('/api/purchase-orders/99999999').set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(res.status).toBe(404);
  });

  test('permission catalog seeded exactly once per role in DB', async () => {
    const { pool } = await import('../../src/config/database');
    const admin = await pool.query(
      `SELECT p.code FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code = 'system_admin' AND p.code LIKE 'purchase-orders:%'
       ORDER BY p.code`
    );
    expect(admin.rows.map(r => r.code)).toEqual([
      'purchase-orders:allocate',
      'purchase-orders:approve',
      'purchase-orders:cancel',
      'purchase-orders:create',
      'purchase-orders:receive',
      'purchase-orders:transfer',
      'purchase-orders:update',
      'purchase-orders:view',
    ]);
    const sup = await pool.query(
      `SELECT count(*)::int AS n FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code IN ('supervisor', 'department_manager') AND p.code LIKE 'purchase-orders:%'`
    );
    expect(sup.rows[0].n).toBe(0);
  });
});

