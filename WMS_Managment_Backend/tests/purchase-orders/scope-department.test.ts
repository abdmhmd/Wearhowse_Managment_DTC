import request from 'supertest';
import { pool } from '../../src/config/database';
import { seedCategory, seedUnit, seedDepartment, seedWarehouse, seedItem } from '../helpers';
import { PO_TEST_PREFIX, seedRoleUser, login, apiCreatePo, poTeardown, type SeedUser } from './helpers';

/**
 * FINDING-1 regression suite (Phase 6.1).
 *
 * A sub_warehouse_manager WITH a department_id resolves to DEPARTMENT data
 * scope (the mandatory production shape). The purchase-order scope logic used
 * to return FALSE (list) / 404 (detail & operations) for that scope, locking
 * production sub-WH managers out of the entire PO module.
 *
 * Approved behaviour: DEPARTMENT scope sees ONLY POs whose receiving warehouse
 * is PERSONALLY assigned via user_warehouses — never the whole department,
 * never an implicit department main warehouse. Zero assigned warehouses ->
 * fail-closed.
 *
 * Note: the system only ever receives POs into a MAIN warehouse
 * (MAIN_WAREHOUSE_REQUIRED), so the fixture's W1 is D1's main warehouse. W2 is
 * a regular sub-warehouse of D1.
 */

describe('Purchase orders — DEPARTMENT scope for department-assigned sub-warehouse managers (FINDING-1)', () => {
  let app: any;
  let D1: number;
  let W1: number;
  let W2: number;
  let itemId: number;
  let unitCode: string;
  let admin: SeedUser;
  let u1: SeedUser;
  let u2: SeedUser;
  let u3: SeedUser;
  let poId: number;
  let detailId: number;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    const catCode = await seedCategory();
    unitCode = await seedUnit();
    D1 = await seedDepartment();
    W1 = await seedWarehouse({ department_id: D1, is_main: true });
    W2 = await seedWarehouse({ department_id: D1 });
    itemId = await seedItem(catCode, unitCode, W1, 0);

    // U1/U2 are department-assigned sub-WH managers; U3 has no warehouse rows.
    u1 = await seedRoleUser('sub_warehouse_manager', { department_id: D1, warehouse_ids: [W1] });
    u2 = await seedRoleUser('sub_warehouse_manager', { department_id: D1, warehouse_ids: [W2] });
    u3 = await seedRoleUser('sub_warehouse_manager', { department_id: D1 });
    admin = await seedRoleUser('admin');

    u1.token = await login(app, u1);
    u2.token = await login(app, u2);
    u3.token = await login(app, u3);
    admin.token = await login(app, admin);

    // Admin creates a PO receiving into W1 and approves it.
    const created = await apiCreatePo(app, admin.token, {
      supplier_name: `${PO_TEST_PREFIX}supplier_scope`,
      warehouse_id: W1,
      lines: [{ item_id: itemId, quantity_ordered: 10, unit_code: unitCode }],
    });
    expect(created.status).toBe(201);
    poId = created.body.data.id;
    detailId = created.body.data.details[0].id;

    const approved = await request(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(approved.status).toBe(200);
  });

  afterAll(async () => {
    await poTeardown(PO_TEST_PREFIX);
  });

  test('U1 (dept-assigned, warehouse W1) lists the W1 PO — list clause is not FALSE', async () => {
    const res = await request(app)
      .get('/api/purchase-orders?limit=50')
      .set('Authorization', `Bearer ${u1.token}`);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((po: any) => po.id === poId)).toBe(true);
  });

  test('U1 GETs the W1 PO - 200', async () => {
    const res = await request(app)
      .get(`/api/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${u1.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(poId);
  });

  test('U1 receives the W1 PO - not 404 (expected 200)', async () => {
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${u1.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 10 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('received');
  });

  test('U1 confirm-transfer is not rejected on scope (standalone PO -> 400 "no linked transfer")', async () => {
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-transfer`)
      .set('Authorization', `Bearer ${u1.token}`);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/no linked transfer/i);
  });

  test('U2 (different assigned warehouse W2) GETs the W1 PO - 404', async () => {
    const res = await request(app)
      .get(`/api/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${u2.token}`);
    expect(res.status).toBe(404);
  });

  test('U2 cannot receive the W1 PO - 404 (out-of-scope mutation is blocked)', async () => {
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${u2.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 10 }] });
    expect(res.status).toBe(404);
  });

  test('U3 (dept-assigned, ZERO warehouse assignments) lists POs - empty (fail-closed)', async () => {
    const res = await request(app)
      .get('/api/purchase-orders?limit=50')
      .set('Authorization', `Bearer ${u3.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  test('U3 (dept-assigned, ZERO warehouse assignments) GETs the PO - 404 (fail-closed)', async () => {
    const res = await request(app)
      .get(`/api/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${u3.token}`);
    expect(res.status).toBe(404);
  });

  test('admin still sees the PO (GLOBAL control)', async () => {
    const res = await request(app)
      .get(`/api/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(poId);
  });
});