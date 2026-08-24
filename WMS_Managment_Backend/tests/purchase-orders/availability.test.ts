import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, seedStock, poTeardown, type PoWorld } from './helpers';

/**
 * Availability overlay: available = physical - open allocations.
 * - Allocation must NOT change item_warehouse_stock.
 * - Transferred quantities stop reserving the source warehouse.
 * - Item-card per-warehouse stock exposes physical/allocated/available.
 */

async function approvedPoWithReceived(app: any, world: PoWorld, qty: number, itemId?: number) {
  const created = await apiCreatePo(app, world.users.admin.token, {
    warehouse_id: world.mainWhA,
    lines: [{ item_id: itemId ?? world.itemId, quantity_ordered: qty, unit_code: world.unitCode }],
  });
  const poId = created.body.data.id;
  const detailId = created.body.data.details[0].id;
  await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
  await request(app)
    .post(`/api/purchase-orders/${poId}/receive`)
    .set('Authorization', `Bearer ${world.users.admin.token}`)
    .send({ lines: [{ detail_id: detailId, quantity: qty }] });
  return { poId, detailId };
}

async function mainWarehouseRow(world: PoWorld, itemId: number) {
  const res = await pool.query(
    'SELECT current_balance FROM item_warehouse_stock WHERE item_id = $1 AND warehouse_id = $2',
    [itemId, world.mainWhA]
  );
  return Number(res.rows[0].current_balance);
}

describe('Purchase orders â€” availability overlay', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('500 physical, receive +100/+120 via two POs, allocate 100+120 â†’ available reflects open reservations', async () => {
    await seedStock(world.itemId, world.mainWhA, 500);

    // First PO: reserve 100
    const p1 = await approvedPoWithReceived(app, world, 100);
    const a1 = await request(app)
      .post(`/api/purchase-orders/${p1.poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: p1.detailId, dest_warehouse_id: world.subWhA1, quantity: 100 });
    expect(a1.status).toBe(201);

    // Second PO: receive 120 and reserve 120
    const created2 = await apiCreatePo(app, world.users.admin.token, {
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 120, unit_code: world.unitCode }],
    });
    const po2 = created2.body.data.id;
    const d2 = created2.body.data.details[0].id;
    await request(app).post(`/api/purchase-orders/${po2}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    await request(app)
      .post(`/api/purchase-orders/${po2}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: d2, quantity: 120 }] });
    const a2 = await request(app)
      .post(`/api/purchase-orders/${po2}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: d2, dest_warehouse_id: world.subWhA2, quantity: 120 });
    expect(a2.status).toBe(201);

    // Physical truth untouched by reservations.
    expect(await mainWarehouseRow(world, world.itemId)).toBe(720);

    // Item card exposes physical / allocated / available.
    const card = await request(app).get(`/api/items/${world.itemId}`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(card.status).toBe(200);
    const whStock = card.body.data.warehouse_stock.find((s: any) => s.warehouse_id === world.mainWhA);
    expect(Number(whStock.physical_stock)).toBe(720);
    expect(Number(whStock.allocated_stock)).toBe(220);
    expect(Number(whStock.available_stock)).toBe(500);
  });

  test('transferring an allocation releases its reservation on the source warehouse', async () => {
    await seedStock(world.itemId2, world.mainWhA, 60);
    const target = await approvedPoWithReceived(app, world, 50, world.itemId2);

    const allocOk = await request(app)
      .post(`/api/purchase-orders/${target.poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: target.detailId, dest_warehouse_id: world.subWhA1, quantity: 40 });
    expect(allocOk.status).toBe(201);

    const beforeCard = await request(app).get(`/api/items/${world.itemId2}`).set('Authorization', `Bearer ${world.users.admin.token}`);
    const stockBefore = beforeCard.body.data.warehouse_stock.find((s: any) => s.warehouse_id === world.mainWhA);
    expect(Number(stockBefore.allocated_stock)).toBe(40);

    const tr = await request(app)
      .post(`/api/purchase-orders/allocations/${allocOk.body.data.id}/transfer`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 40 });
    expect(tr.status).toBe(200);

    const afterCard = await request(app).get(`/api/items/${world.itemId2}`).set('Authorization', `Bearer ${world.users.admin.token}`);
    const stockAfter = afterCard.body.data.warehouse_stock.find((s: any) => s.warehouse_id === world.mainWhA);
    // Reservation released; destination gained the units physically.
    expect(Number(stockAfter.allocated_stock)).toBe(0);
    expect(Number(stockAfter.available_stock)).toBe(Number(stockAfter.physical_stock));
    const dst = afterCard.body.data.warehouse_stock.find((s: any) => s.warehouse_id === world.subWhA1);
    expect(dst).toBeDefined();
    expect(Number(dst.physical_stock)).toBe(40);
  });
});

