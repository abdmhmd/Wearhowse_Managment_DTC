import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, seedStock, getStock, poTeardown, type PoWorld } from './helpers';

/**
 * Concurrency: FOR UPDATE row locks prevent over-allocation / over-transfer /
 * over-receiving when requests race.
 */

async function setupReceived(app: any, world: PoWorld, qty: number) {
const created = await apiCreatePo(app, world.users.admin.token, {
    supplier_id: world.supplierId,
    warehouse_id: world.mainWhA,
    lines: [{ item_id: world.itemId, quantity_ordered: qty, unit_code: world.unitCode }],
  });
  const poId = created.body.data.id;
  const detailId = created.body.data.details[0].id;
  await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
  const rec = await request(app)
    .post(`/api/purchase-orders/${poId}/receive`)
    .set('Authorization', `Bearer ${world.users.admin.token}`)
    .send({ lines: [{ detail_id: detailId, quantity: qty }] });
  expect(rec.status).toBe(200);
  return { poId, detailId };
}

describe('Purchase orders â€” concurrency protection', () => {
  let app: any;
  let world: PoWorld;

beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('racing allocations (60+60 against received=100): exactly one succeeds', async () => {
    await seedStock(world.itemId, world.mainWhA, 500);
    const { poId, detailId } = await setupReceived(app, world, 100);

    const [r1, r2] = await Promise.all([
      request(app)
        .post(`/api/purchase-orders/${poId}/allocations`)
        .set('Authorization', `Bearer ${world.users.admin.token}`)
        .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 60 }),
      request(app)
        .post(`/api/purchase-orders/${poId}/allocations`)
        .set('Authorization', `Bearer ${world.users.admin.token}`)
        .send({ detail_id: detailId, dest_warehouse_id: world.subWhA2, quantity: 60 }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // One must win (201), the other must be rejected by the allocated<=received guard.
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(400);
    expect(Number((await pool.query(
      'SELECT quantity_allocated::float8 AS q FROM purchase_order_details WHERE id = $1', [detailId]
    )).rows[0].q)).toBeLessThanOrEqual(100);
  });

  test('racing transfers draining one allocation: sum transferred == allocated, none negative-stock', async () => {
    await seedStock(world.itemId2, world.mainWhA, 200);
const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_id: world.supplierId,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId2, quantity_ordered: 30, unit_code: world.unitCode }],
    });
    const poId = created.body.data.id;
    const detailId = created.body.data.details[0].id;
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 30 }] });
    const alloc = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 20 });
    const allocationId = alloc.body.data.id;

    const dstBefore = await getStock(world.itemId2, world.subWhA1);

    const results = await Promise.all([
      request(app).post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
        .set('Authorization', `Bearer ${world.users.admin.token}`).send({ quantity: 15 }),
      request(app).post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
        .set('Authorization', `Bearer ${world.users.admin.token}`).send({ quantity: 15 }),
      request(app).post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
        .set('Authorization', `Bearer ${world.users.admin.token}`).send({ quantity: 15 }),
    ]);

    const okCount = results.filter(r => r.status === 200).length;
    // Exactly ONE 15-unit transfer can succeed (allocated=20); the other two
    // must fail on the remaining-quantity guard.
    expect(okCount).toBe(1);

const row = (await pool.query(
      'SELECT quantity_transferred::float8 AS qt FROM purchase_order_allocations WHERE id = $1',
      [allocationId]
    )).rows[0];
    expect(Number(row.qt)).toBe(15);
    expect(await getStock(world.itemId2, world.subWhA1)).toBe(dstBefore + 15);
    expect(await getStock(world.itemId2, world.mainWhA)).toBeGreaterThanOrEqual(0);

    const confirm = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/confirm-transfer`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.status).toBe('partially_transferred');
  });
});

