import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { usersService } from '../../src/modules/users/users.service';
import { ValidationError } from '../../src/utils/AppError';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * Regression tests for the audit remediation:
 *   HIGH-1  transactions list must fail CLOSED (empty) for zero-assignment
 *           warehouse managers, never 500 and never leaking other warehouses.
 *   HIGH-2  inventory report must scope to the caller's warehouses.
 *   HIGH-3  item card sub-queries (movements / summary / last RV / last LN /
 *           per-warehouse stock) must scope by movement warehouse.
 *   HIGH-4  material request creation for a zero-assignment warehouse manager:
 *           requires an explicit, eligible warehouse_id (fallback); without it
 *           the request is rejected.
 *   WM      sub_warehouse_manager must always keep >= 1 warehouse assignment.
 */
const prefix = `${TEST_PREFIX}scope_reg_`;
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

describe('Scope regressions (audit remediation)', () => {
  let admin: SeedRoleUser;
  let wmAssigned: SeedRoleUser;
  let wmZero: SeedRoleUser;
  let dm: SeedRoleUser;

  let catCode: string;
  let unitCode: string;
  let deptA: number;
  let deptB: number;
  let whA: number;
  let whB: number;
  let itemA: number;
  let itemB: number;

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
    itemA = await seedItem(catCode, unitCode, whA, 100);
    itemB = await seedItem(catCode, unitCode, whB, 100);

    admin = await seedRoleUser('admin');
    wmAssigned = await seedRoleUser('sub_warehouse_manager', { warehouse_ids: [whA] });
    wmZero = await seedRoleUser('sub_warehouse_manager');
    dm = await seedRoleUser('department_manager', { department_id: deptA });

    admin.token = await login(admin);
    wmAssigned.token = await login(wmAssigned);
    wmZero.token = await login(wmZero);
    dm.token = await login(dm);
  });

  afterAll(async () => {
    const userIds = [admin, wmAssigned, wmZero, dm].map((u) => u.id);
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
    await pool.query('DELETE FROM audit_logs WHERE user_id = ANY($1)', [userIds]);
    await cleanup(prefix);
  });

  describe('HIGH-1: transactions list fail-closed', () => {
    test('assigned WM only sees transactions for assigned warehouses', async () => {
      const txnA = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whA, supplier_id: null, department_id: deptA, notes: 'scoped RV A' },
          details: [{ item_id: itemA, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(txnA.status).toBe(201);

      const txnB = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whB, supplier_id: null, department_id: deptB, notes: 'scoped RV B' },
          details: [{ item_id: itemB, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(txnB.status).toBe(201);

      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${wmAssigned.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((x: any) => x.id);
      expect(ids).toContain(txnA.body.data.id);
      expect(ids).not.toContain(txnB.body.data.id);
    });

    test('zero-assignment WM gets an empty list, not a 500', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${wmZero.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });

    test('admin still sees all warehouses (global scope untouched)', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });
  });

  describe('HIGH-1b: department_manager scoped list (parameter binding regression)', () => {
    let dmRvId: number;
    let dmRvOtherId: number;

    beforeAll(async () => {
      const rvA = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whA, supplier_id: null, department_id: deptA, notes: 'dm scoped RV A' },
          details: [{ item_id: itemA, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(rvA.status).toBe(201);
      dmRvId = rvA.body.data.id;

      const rvB = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whB, supplier_id: null, department_id: deptB, notes: 'dm scoped RV B' },
          details: [{ item_id: itemB, quantity: 1, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(rvB.status).toBe(201);
      dmRvOtherId = rvB.body.data.id;
    });

    test('department_manager list returns 200, not a bind-message 500', async () => {
      const res = await request(app)
        .get('/api/transactions?page=1&limit=100')
        .set('Authorization', `Bearer ${dm.token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    test('department_manager list stays 200 when combined with type/status filters', async () => {
      const res = await request(app)
        .get('/api/transactions?type=RV&status=draft')
        .set('Authorization', `Bearer ${dm.token}`);
      expect(res.status).toBe(200);
    });

    test('department_manager only sees their own department transactions', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${dm.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((x: any) => x.id);
      expect(ids).toContain(dmRvId);
      expect(ids).not.toContain(dmRvOtherId);
    });

    test('pagination.total (count query) is scoped and pagination works', async () => {
      const res = await request(app)
        .get('/api/transactions?page=1&limit=1')
        .set('Authorization', `Bearer ${dm.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pagination.totalPages).toBeGreaterThanOrEqual(1);
      const page2 = await request(app)
        .get('/api/transactions?page=2&limit=1')
        .set('Authorization', `Bearer ${dm.token}`);
      expect(page2.status).toBe(200);
      expect(Array.isArray(page2.body.data.items)).toBe(true);
    });
  });

  describe('HIGH-2: inventory report scoping', () => {
    test('zero-assignment WM gets an empty report, not a 500', async () => {
      const res = await request(app)
        .get('/api/reports/inventory')
        .set('Authorization', `Bearer ${wmZero.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });

    test('assigned WM only sees items homed in assigned warehouses', async () => {
      const res = await request(app)
        .get('/api/reports/inventory')
        .set('Authorization', `Bearer ${wmAssigned.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((x: any) => x.id);
      expect(ids).toContain(itemA);
      expect(ids).not.toContain(itemB);
    });
  });

  describe('HIGH-3: item card movement scoping', () => {
    let rvWhAId: number;
    let rvWhBId: number;

    beforeAll(async () => {
      // IN movement for itemA recorded against whA ...
      const rvA = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whA, supplier_id: null, department_id: deptA, notes: 'card RV A' },
          details: [{ item_id: itemA, quantity: 3, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(rvA.status).toBe(201);
      rvWhAId = rvA.body.data.id;
      const apprA = await request(app)
        .post(`/api/transactions/${rvWhAId}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(apprA.status).toBe(200);

      // ... and a second IN movement for the SAME item recorded against whB.
      const rvB = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          header: { type: 'RV', warehouse_id: whB, supplier_id: null, department_id: deptB, notes: 'card RV B' },
          details: [{ item_id: itemA, quantity: 8, unit_code: unitCode, unit_price: 10, batch_number: null }],
        });
      expect(rvB.status).toBe(201);
      rvWhBId = rvB.body.data.id;
      const apprB = await request(app)
        .post(`/api/transactions/${rvWhBId}/approve`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(apprB.status).toBe(200);
    });

    test('assigned WM summary only counts movements from their warehouses', async () => {
      const res = await request(app)
        .get(`/api/reports/item-card/${itemA}`)
        .set('Authorization', `Bearer ${wmAssigned.token}`);
      expect(res.status).toBe(200);
      const summary = res.body.data.summary;
      expect(Number(summary.total_in)).toBe(3);
      expect(Number(summary.total_out)).toBe(0);
      expect(Number(summary.total_movements)).toBe(1);

      for (const m of res.body.data.recent_movements) {
        expect(m.warehouse_id).toBe(whA);
      }
      expect(res.body.data.last_receiving_voucher.id).toBe(rvWhAId);
    });

    test('admin summary counts all warehouses (global)', async () => {
      const res = await request(app)
        .get(`/api/reports/item-card/${itemA}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(Number(res.body.data.summary.total_in)).toBe(11);
      expect(Number(res.body.data.summary.total_movements)).toBe(2);
    });

    test('zero-assignment WM cannot view the item card (fail-closed 404)', async () => {
      const res = await request(app)
        .get(`/api/reports/item-card/${itemA}`)
        .set('Authorization', `Bearer ${wmZero.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('HIGH-4: material request creation for a zero-assignment warehouse manager (fallback)', () => {
    test('zero-assignment WM can create a request by selecting a valid warehouse (201)', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${wmZero.token}`)
        .send({
          department_id: deptA,
          warehouse_id: whA,
          request_type: 'experiment',
          priority: 'normal',
          notes: `${prefix}fallback`,
          items: [{ item_id: itemA, quantity: 1, unit_code: unitCode }],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.warehouse_id).toBe(whA);
      expect(res.body.data.department_id).toBe(deptA);
    });

    test('zero-assignment WM without a warehouse_id is rejected (400)', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${wmZero.token}`)
        .send({
          department_id: deptA,
          request_type: 'experiment',
          priority: 'normal',
          notes: `${prefix}blocked`,
          items: [{ item_id: itemA, quantity: 1, unit_code: unitCode }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Warehouse manager assignment enforcement', () => {
    test('usersService.create rejects a sub_warehouse_manager with no warehouses', async () => {
      await expect(
        usersService.create({
          username: `${prefix}wm_none_${shortId()}`,
          password_hash: 'dummy_hash',
          full_name: 'No WH',
          role: 'sub_warehouse_manager',
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    test('usersService.update rejects stripping the last warehouse', async () => {
      const created = await usersService.create({
        username: `${prefix}wm_strip_${shortId()}`,
        password_hash: 'dummy_hash',
        full_name: 'Strip WH',
        role: 'sub_warehouse_manager',
        warehouse_ids: [whA],
      });
      await expect(
        usersService.update(created.id, { warehouse_ids: [] })
      ).rejects.toBeInstanceOf(ValidationError);

      const stillAssigned = await pool.query(
        'SELECT COUNT(*)::int AS n FROM user_warehouses WHERE user_id = $1',
        [created.id]
      );
      expect(stillAssigned.rows[0].n).toBe(1);
    });

    test('usersService.update accepts a valid warehouse reassignment', async () => {
      const created = await usersService.create({
        username: `${prefix}wm_reassign_${shortId()}`,
        password_hash: 'dummy_hash',
        full_name: 'Reassign',
        role: 'sub_warehouse_manager',
        warehouse_ids: [whA],
      });
      const updated = await usersService.update(created.id, { warehouse_ids: [whB] });
      expect(updated.warehouse_ids).toEqual([whB]);
    });

    test('create endpoint returns 400 for WM without warehouses (validator)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          username: `${prefix}http_wm_${shortId()}`,
          password: 'testPass123',
          full_name: 'HTTP WM',
          role: 'sub_warehouse_manager',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
