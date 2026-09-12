import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, seedStock, getStock, poTeardown, type PoWorld } from './helpers';

/**
 * Partial transfer: allocated 50 â†’ transfer 30 (partially_transferred) â†’
 * transfer 20 (transferred). Over-transfer (21 more) rejected. Physical stock
 * moves main â†’ destination atomically via a linked TRF voucher.
 */

async function setupAllocation(app: any, world: PoWorld, ordered: number, allocatedQty: number, dest = 0) {
const created = await apiCreatePo(app, world.users.admin.token, {
    supplier_id: world.supplierId,
    warehouse_id: world.mainWhA,
    lines: [{ item_id: world.itemId, quantity_ordered: ordered, unit_code: world.unitCode }],
  });
  const poId = created.body.data.id;
  const detailId = created.body.data.details[0].id;
  await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
  await request(app)
    .post(`/api/purchase-orders/${poId}/receive`)
    .set('Authorization', `Bearer ${world.users.admin.token}`)
    .send({ lines: [{ detail_id: detailId, quantity: ordered }] });
  const alloc = await request(app)
    .post(`/api/purchase-orders/${poId}/allocations`)
    .set('Authorization', `Bearer ${world.users.admin.token}`)
    .send({ detail_id: detailId, dest_warehouse_id: dest || world.subWhA1, quantity: allocatedQty });
  expect(alloc.status).toBe(201);
  return { poId, detailId, allocationId: alloc.body.data.id };
}

describe('Purchase orders â€” partial transfer', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

test('transfer 30 then 20 of 50; over-transfer rejected; physical stock moved', async () => {
    await seedStock(world.itemId, world.mainWhA, 100);
    const { allocationId } = await setupAllocation(app, world, 60, 50);

    const srcBefore = await getStock(world.itemId, world.mainWhA);
    const dstBefore = await getStock(world.itemId, world.subWhA1);

    // transfer 30
    const t1 = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 30 });
    expect(t1.status).toBe(200);
    expect(t1.body.data.status).toBe('pending_confirmation');
    expect(Number(t1.body.data.remaining)).toBe(20);

    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore - 30);
    expect(await getStock(world.itemId, world.subWhA1)).toBe(dstBefore + 30);

    // confirm by a different user first so the next transfer is allowed
    const c1 = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/confirm-transfer`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(c1.status).toBe(200);
    expect(c1.body.data.status).toBe('partially_transferred');

    // transfer 21 â€" exceeds remaining 20
    const tBad = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 21 });
    expect(tBad.status).toBe(400);

    // transfer remaining 20
    const t2 = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 20 });
    expect(t2.status).toBe(200);
    expect(t2.body.data.status).toBe('pending_confirmation');

    const c2 = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/confirm-transfer`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(c2.status).toBe(200);
    expect(c2.body.data.status).toBe('transferred');

    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore - 50);
    expect(await getStock(world.itemId, world.subWhA1)).toBe(dstBefore + 50);

    // fully transferred â†' nothing left to move
    const t3 = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 1 });
    expect(t3.status).toBe(400);
  });

  test('TRF voucher is linked to the PO with correct source/destination', async () => {
    await seedStock(world.itemId, world.mainWhA, 80);
    const { allocationId, poId } = await setupAllocation(app, world, 25, 10, world.subWhA2);

const res = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending_confirmation');

    const txnRes = await pool.query('SELECT * FROM transactions WHERE id = $1', [res.body.data.transaction_id]);
    const txn = txnRes.rows[0];
    expect(txn.type).toBe('TRF');
    expect(txn.status).toBe('approved');
    expect(txn.purchase_order_id).toBe(poId);
    expect(txn.warehouse_id).toBe(world.mainWhA);
    expect(txn.to_warehouse_id).toBe(world.subWhA2);

    const movements = await pool.query(
      'SELECT movement_type, warehouse_id FROM stock_movements WHERE transaction_id = $1 ORDER BY id',
      [res.body.data.transaction_id]
    );
    expect(movements.rows.length).toBe(2);
    expect(movements.rows[0].movement_type).toBe('OUT');
    expect(movements.rows[0].warehouse_id).toBe(world.mainWhA);
    expect(movements.rows[1].movement_type).toBe('IN');
    expect(movements.rows[1].warehouse_id).toBe(world.subWhA2);

    const confirm = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/confirm-transfer`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.status).toBe('transferred');
  });

  test('WM transfers only from their own source main warehouse', async () => {
    await seedStock(world.itemId, world.mainWhA, 40);
    const { allocationId } = await setupAllocation(app, world, 12, 6, world.subWhA1);

    // wmB is scoped to mainWhB â€” cannot move stock sourced from mainWhA
    const loginB = await request(app)
      .post('/api/auth/login')
      .send({ username: world.users.wmB.username, password: world.users.wmB.password });
    const tokenB = loginB.body?.data?.token as string;
    const forbidden = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ quantity: 1 });
    expect([403, 404]).toContain(forbidden.status);

// owner WM can transfer
    const ok = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ quantity: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('pending_confirmation');
  });

  test('insufficient physical stock at transfer time rolls the whole transfer back', async () => {
    // Allocation made while stock exists; then drain the main warehouse below
    // the reservation via an unrelated OUT (simulated by direct SQL UPDATE) so
    // the TRF approval must fail and roll back.
    await seedStock(world.itemId, world.mainWhA, 500);
    const { allocationId } = await setupAllocation(app, world, 30, 15, world.subWhA1);
    await seedStock(world.itemId, world.mainWhA, 5); // drain below reservation

    const dstBefore = await getStock(world.itemId, world.subWhA1);
    const allocBefore = (await pool.query(
      'SELECT quantity_transferred, status FROM purchase_order_allocations WHERE id = $1',
      [allocationId]
    )).rows[0];

    const res = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 10 });
    expect(res.status).toBe(400);

    const dstAfter = await getStock(world.itemId, world.subWhA1);
    const allocAfter = (await pool.query(
      'SELECT quantity_transferred, status::text AS status FROM purchase_order_allocations WHERE id = $1',
      [allocationId]
    )).rows[0];

    expect(dstAfter).toBe(dstBefore);
    expect(Number(allocAfter.quantity_transferred)).toBe(Number(allocBefore.quantity_transferred));
    expect(allocAfter.status).toBe(allocBefore.status);
  });
});

