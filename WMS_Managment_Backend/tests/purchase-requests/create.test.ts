import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup } from '../helpers';
import { PR_TEST_PREFIX, seedPrWorld, login, apiCreatePr, validPrBody, prTeardown, type PrWorld } from './helpers';

describe('Purchase requests — create', () => {
  let app: any;
  let world: PrWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPrWorld();
    for (const u of Object.values(world.users)) u.token = await login(app, u);
  });

  afterAll(async () => { await prTeardown(PR_TEST_PREFIX); });

  test('201 with pending status and request_no PR-YYYY-XXXXXX', async () => {
    const body = validPrBody(world.mainWhA, world.itemId, world.itemId2, world.unitCode);
    const res = await apiCreatePr(app, world.users.wmA.token, body);

    expect(res.status).toBe(201);
    expect(res.body.data.request_no).toMatch(/^PR-\d{4}-\d{6}$/);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.department_id).toBe(world.deptA);
    expect(res.body.data.warehouse_id).toBe(world.mainWhA);
    expect(res.body.data.created_by).toBe(world.users.wmA.id);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.purchase_order_id).toBeNull();
  });

  test('400 when no items are supplied', async () => {
    const res = await apiCreatePr(app, world.users.wmA.token, {
      warehouse_id: world.mainWhA,
      items: [],
    });
    expect(res.status).toBe(400);
  });

  test('400 when quantity is not positive', async () => {
    const res = await apiCreatePr(app, world.users.wmA.token, {
      warehouse_id: world.mainWhA,
      items: [{ item_id: world.itemId, quantity: 0, unit_code: world.unitCode }],
    });
    expect(res.status).toBe(400);
  });

  test('400 when an item does not belong to the department (cross-department item)', async () => {
    const res = await apiCreatePr(app, world.users.wmA.token, {
      warehouse_id: world.mainWhA,
      items: [{ item_id: world.foreignItemId, quantity: 3, unit_code: world.unitCode }],
    });
    expect(res.status).toBe(400);
  });

  test('400 when target warehouse is NOT a main warehouse', async () => {
    const res = await apiCreatePr(app, world.users.wmA.token, {
      warehouse_id: world.subWhA1,
      items: [{ item_id: world.itemId, quantity: 3, unit_code: world.unitCode }],
    });
    expect(res.status).toBe(400);
  });

  test('400 when target warehouse belongs to another department', async () => {
    const res = await apiCreatePr(app, world.users.wmA.token, {
      warehouse_id: world.mainWhB,
      items: [{ item_id: world.itemId, quantity: 3, unit_code: world.unitCode }],
    });
    expect(res.status).toBe(400);
  });

  test('400 when unit_code does not exist', async () => {
    const res = await apiCreatePr(app, world.users.wmA.token, {
      warehouse_id: world.mainWhA,
      items: [{ item_id: world.itemId, quantity: 3, unit_code: 'no-such-unit' }],
    });
    expect(res.status).toBe(400);
  });

  test('403 for roles without purchase-requests:create (dept manager, supervisor, admin)', async () => {
    for (const user of [world.users.deptMgrA, world.users.supervisor, world.users.admin]) {
const body = validPrBody(world.mainWhA, world.itemId, world.itemId2, world.unitCode);
      const res = await apiCreatePr(app, user.token, body);
      expect(res.status).toBe(403);
    }
  });

  test('created request does not exceed 200 items', async () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      item_id: world.itemId,
      quantity: 1,
      unit_code: world.unitCode,
    }));
    const res = await apiCreatePr(app, world.users.wmA.token, {
      warehouse_id: world.mainWhA,
      items,
    });
    expect(res.status).toBe(400);
  });

  test('DB has exactly one row per request with a UNIQUE request_no', async () => {
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM purchase_requests WHERE created_by = $1`,
      [world.users.wmA.id]
    );
    const body = validPrBody(world.mainWhA, world.itemId2, world.itemId, world.unitCode);
    const res = await apiCreatePr(app, world.users.wmA.token, body);
    expect(res.status).toBe(201);
    const after = await pool.query(
      `SELECT count(*)::int AS n FROM purchase_requests WHERE created_by = $1`,
      [world.users.wmA.id]
    );
    expect(after.rows[0].n).toBe(before.rows[0].n + 1);
  });
});