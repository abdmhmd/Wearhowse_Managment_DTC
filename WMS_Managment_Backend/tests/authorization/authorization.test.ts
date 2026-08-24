import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}authz_`;
let app: any;

interface SeedRoleUser {
  id: number;
  username: string;
  password: string;
  role: string;
  token: string;
}

/** Creates an active user with the given role, department and warehouse assignments. */
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
  expect(res.body.data.token).toBeDefined();
  return res.body.data.token as string;
}

describe('Authorization (RBAC + Data Scope)', () => {
  let admin: SeedRoleUser;
  let whManager: SeedRoleUser;
  let wm2: SeedRoleUser;
  let deptManager: SeedRoleUser;
  let dm2: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whA: number;
  let whB: number;
  let itemId: number;

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
    whManager = await seedRoleUser('warehouse_manager', { warehouse_ids: [whA] });
    wm2 = await seedRoleUser('warehouse_manager', { warehouse_ids: [whB] });
    deptManager = await seedRoleUser('department_manager', { department_id: deptA });
    dm2 = await seedRoleUser('department_manager', { department_id: deptB });

    admin.token = await login(admin);
    whManager.token = await login(whManager);
    wm2.token = await login(wm2);
    deptManager.token = await login(deptManager);
    dm2.token = await login(dm2);
  });

  afterAll(async () => {
    const userIds = [admin, whManager, wm2, deptManager, dm2].map((u) => u.id);
    await pool.query(
      `DELETE FROM stock_movements USING transactions
       WHERE stock_movements.transaction_id = transactions.id AND transactions.created_by = ANY($1)`,
      [userIds]
    );
    await pool.query(
      `DELETE FROM transaction_details USING transactions
       WHERE transaction_details.transaction_id = transactions.id AND transactions.created_by = ANY($1)`,
      [userIds]
    );
    await pool.query('DELETE FROM transactions WHERE created_by = ANY($1)', [userIds]);
    await pool.query(
      'DELETE FROM material_request_details USING material_requests WHERE material_request_details.request_id = material_requests.id AND material_requests.notes LIKE $1',
      [`${prefix}%`]
    );
    await pool.query('DELETE FROM material_requests WHERE notes LIKE $1', [`${prefix}%`]);
    await cleanup(prefix);
  });

  describe('GET /api/auth/me', () => {
    test('returns permissions and warehouse assignments', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.permissions.length).toBeGreaterThan(0);
      expect(res.body.data.user.permissions).toContain('users:create');
    });

    test('warehouse_manager has assigned warehouse ids', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${whManager.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.warehouse_ids).toContain(whA);
      expect(res.body.data.user.warehouse_ids).not.toContain(whB);
    });

    test('department_manager has department scoped permissions (no users:create)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${deptManager.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.permissions).not.toContain('requests:create');
      expect(res.body.data.user.permissions).toContain('requests:approve');
      expect(res.body.data.user.permissions).not.toContain('users:create');
      expect(res.body.data.user.department_id).toBe(deptA);
    });
  });

  describe('Permission matrix (route-level guards)', () => {
    test('system_admin can create categories', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ code: `${prefix}cat_${shortId()}`, name_ar: 'AdminCat' });
      expect(res.status).toBe(201);
    });

    test('warehouse_manager cannot create categories (403)', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${whManager.token}`)
        .send({ code: `${prefix}cat_x_${shortId()}`, name_ar: 'Forbidden' });
      expect(res.status).toBe(403);
    });

    test('department_manager cannot delete categories (403)', async () => {
      const res = await request(app)
        .delete(`/api/categories/${catCode}`)
        .set('Authorization', `Bearer ${dm2.token}`);
      expect(res.status).toBe(403);
    });

    test('system_admin can delete categories', async () => {
      const res = await request(app)
        .delete(`/api/categories/${catCode}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
    });

    test('department_manager cannot approve transactions (403)', async () => {
      const txn = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: {
            type: 'RV',
            warehouse_id: whA,
            supplier_id: null,
            department_id: null,
            notes: 'authz test RV',
          },
          details: [
            { item_id: itemId, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null },
          ],
        });
      expect(txn.status).toBe(201);
      const txnId = txn.body.data.id;
      const res = await request(app)
        .post(`/api/transactions/${txnId}/approve`)
        .set('Authorization', `Bearer ${deptManager.token}`);
      expect(res.status).toBe(403);
    });

    test('department_manager cannot create items (403)', async () => {
      const res = await request(app)
        .post('/api/items')
        .set('Authorization', `Bearer ${deptManager.token}`)
        .send({
          item_code: `${prefix}item_x_${shortId()}`,
          name_ar: 'X',
          category_code: catCode,
          unit_code: unitCode,
          warehouse_id: whA,
          current_balance: 0,
        });
      expect(res.status).toBe(403);
    });

    test('unauthenticated request is rejected (401)', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(401);
    });
  });

  describe('Department isolation (material requests)', () => {
    async function createRequestAs(token: string, deptId: number, whId: number) {
      return request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          department_id: deptId,
          warehouse_id: whId,
          request_type: 'experiment',
          priority: 'normal',
          notes: `${prefix}test_request`,
          items: [{ item_id: itemId, quantity: 1, unit_code: unitCode }],
        });
    }

    test('department_manager only sees requests of own department', async () => {
      const rA = await createRequestAs(admin.token, deptA, whA);
      expect(rA.status).toBe(201);
      const requestIdA = rA.body.data.id;

      await createRequestAs(admin.token, deptB, whB);

      const list = await request(app)
        .get('/api/requests')
        .set('Authorization', `Bearer ${deptManager.token}`);
      expect(list.status).toBe(200);
      const ids = list.body.data.items.map((r: any) => r.id);
      expect(ids).toContain(requestIdA);
      // dept_manager must never see a request belonging to deptB
      for (const r of list.body.data.items) {
        expect(r.id).not.toBe(undefined);
        const detail = await request(app)
          .get(`/api/requests/${r.id}`)
          .set('Authorization', `Bearer ${deptManager.token}`);
        expect(detail.status).toBe(200);
        expect(detail.body.data.department_id).toBe(deptA);
      }
    });

    test('department_manager cannot read a request of another department (404)', async () => {
      const rB = await createRequestAs(admin.token, deptB, whB);
      const otherId = rB.body.data.id;
      const res = await request(app)
        .get(`/api/requests/${otherId}`)
        .set('Authorization', `Bearer ${deptManager.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Warehouse isolation (transactions)', () => {
    test('warehouse_manager only sees transactions in assigned warehouses', async () => {
      // transaction in whB (not assigned to whManager)
      await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whB, supplier_id: null, department_id: null, notes: 'whB txn' },
          details: [{ item_id: itemId, quantity: 1, unit_code: unitCode, unit_price: 5, batch_number: null }],
        });

      const list = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${whManager.token}`);
      expect(list.status).toBe(200);
      const whIds = list.body.data.items.map((t: any) => t.warehouse_id);
      // whManager only ever sees whA rows (this test DB only has our own txns,
      // and whB txn must not appear)
      expect(whIds.every((id: number) => id === whA)).toBe(true);
    });
  });

  describe('token_version revocation', () => {
    test('stale access token is rejected after token_version bump', async () => {
      const stale = await seedRoleUser('warehouse_manager', { warehouse_ids: [whA] });
      const staleToken = await login(stale);

      const ok = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${staleToken}`);
      expect(ok.status).toBe(200);

      await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [stale.id]);

      const rejected = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${staleToken}`);
      expect(rejected.status).toBe(401);
      expect(rejected.body.error.code).toBe('AUTH_TOKEN_INVALID');
    });
  });
});
