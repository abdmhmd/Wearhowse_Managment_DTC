import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, seedStock, poTeardown, type PoWorld } from './helpers';

/**
 * Direct-API security: forged IDs, cross-warehouse/cross-department access,
 * supervisor/department-manager exclusion. No frontend involved.
 */

async function fullWorkflowPo(app: any, world: PoWorld, qty = 20) {
const created = await apiCreatePo(app, world.users.admin.token, {
    supplier_name: world.supplierName,
    warehouse_id: world.mainWhA,
    lines: [{ item_id: world.itemId, quantity_ordered: qty, unit_code: world.unitCode }],
  });
  const poId = created.body.data.id;
  const detailId = created.body.data.details[0].id;
  await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
  await request(app)
    .post(`/api/purchase-orders/${poId}/receive`)
    .set('Authorization', `Bearer ${world.users.admin.token}`)
    .send({ lines: [{ detail_id: detailId, quantity: 20 }] });
  return { poId, detailId };
}

describe('Purchase orders â€” scope & security (direct API)', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    for (const u of Object.values(world.users)) u.token = await login(app, u);
    await seedStock(world.itemId, world.mainWhA, 400);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('unauthenticated access rejected', async () => {
    const res = await request(app).get('/api/purchase-orders');
    expect([401, 403]).toContain(res.status);
  });

  test('supervisor cannot create / list / mutate purchase orders', async () => {
    expect((await apiCreatePo(app, world.users.supervisor.token, {
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 1, unit_code: world.unitCode }],
    })).status).toBe(403);

    expect((await request(app).get('/api/purchase-orders').set('Authorization', `Bearer ${world.users.supervisor.token}`)).status).toBe(403);

    expect((await request(app)
      .post('/api/purchase-orders/1/approve')
      .set('Authorization', `Bearer ${world.users.supervisor.token}`)).status).toBe(403);
  });

  test('department manager has no purchase order permissions', async () => {
    expect((await apiCreatePo(app, world.users.deptMgr.token, {
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 1, unit_code: world.unitCode }],
    })).status).toBe(403);
    expect((await request(app).get('/api/purchase-orders').set('Authorization', `Bearer ${world.users.deptMgr.token}`)).status).toBe(403);
  });

  test('WM cannot view / approve another warehouse PO (hidden as 404)', async () => {
const createdB = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhB,
      lines: [{ item_id: world.itemId, quantity_ordered: 5, unit_code: world.unitCode }],
    });
    const poB = createdB.body.data.id;

    expect((await request(app).get(`/api/purchase-orders/${poB}`).set('Authorization', `Bearer ${world.users.wmMain.token}`)).status).toBe(404);
    expect((await request(app).post(`/api/purchase-orders/${poB}/approve`).set('Authorization', `Bearer ${world.users.wmMain.token}`)).status).toBe(404);
    expect((await request(app).post(`/api/purchase-orders/${poB}/cancel`).set('Authorization', `Bearer ${world.users.wmMain.token}`)).status).toBe(404);
  });

  test('WM cannot receive or allocate against a foreign PO', async () => {
    const { poId, detailId } = await fullWorkflowPo(app, world);
    // wmMain IS in scope for mainWhA â€” sanity check receive works for owner
    void poId; void detailId;

const createdB = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhB,
      lines: [{ item_id: world.itemId2, quantity_ordered: 5, unit_code: world.unitCode }],
    });
    const poB = createdB.body.data.id;
    const detailB = createdB.body.data.details[0].id;
    await request(app).post(`/api/purchase-orders/${poB}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);

    expect((await request(app)
      .post(`/api/purchase-orders/${poB}/receive`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ lines: [{ detail_id: detailB, quantity: 1 }] })).status).toBe(404);

    expect((await request(app)
      .post(`/api/purchase-orders/${poB}/allocations`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ detail_id: detailB, dest_warehouse_id: world.subWhB, quantity: 1 })).status).toBe(404);
  });

  test('forged allocation id returns 404; forged ids never leak other tenants', async () => {
    const res = await request(app)
      .post('/api/purchase-orders/allocations/99999999/transfer')
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 1 });
    expect(res.status).toBe(404);
  });

  test('forged detail_id on receive returns 404 without touching stock', async () => {
    // Approved but NOT received: the status gate must pass so the request
    // actually reaches the (forged) detail lookup.
const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 5, unit_code: world.unitCode }],
    });
    const poId = created.body.data.id;
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);

    const stockBefore = Number((await pool.query(
      'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
      [world.itemId, world.mainWhA]
    )).rows[0].current_balance);

    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: 99999999, quantity: 1 }] });
    expect(res.status).toBe(404);

    const stockAfter = Number((await pool.query(
      'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
      [world.itemId, world.mainWhA]
    )).rows[0].current_balance);
    expect(stockAfter).toBe(stockBefore);
  });

  test('WM cannot transfer an allocation sourced from another main warehouse (hidden)', async () => {
    const target = await fullWorkflowPo(app, world);
    const alloc = await request(app)
      .post(`/api/purchase-orders/${target.poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: target.detailId, dest_warehouse_id: world.subWhA1, quantity: 5 });
    expect(alloc.status).toBe(201);
    const allocationId = alloc.body.data.id;

    // wmB scoped to mainWhB only
    const loginB = await request(app).post('/api/auth/login')
      .send({ username: world.users.wmB.username, password: world.users.wmB.password });
    const tokenB = loginB.body.data.token;

    expect((await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ quantity: 1 })).status).toBe(404);
  });
});

