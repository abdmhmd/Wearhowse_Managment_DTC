import request from 'supertest';
import { cleanup } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, seedStock, getStock, poTeardown, type PoWorld } from './helpers';

/**
 * Allocation rules: reservation-only (no physical movement), cumulative
 * allocated <= received, destination must be an active non-main department
 * warehouse within scope/department, source derived from the PO.
 */

async function approvedPoWithReceived(app: any, world: PoWorld, qty: number) {
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

describe('Purchase orders â€” allocation', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('allocate creates a reservation without touching physical stock', async () => {
    // Pre-seed extra physical stock so availability covers the reservation.
    await seedStock(world.itemId, world.mainWhA, 500);
    const { poId } = await approvedPoWithReceived(app, world, 100);
    const before = await getStock(world.itemId, world.mainWhA);

    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: (await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.admin.token}`)).body.data.details[0].id, dest_warehouse_id: world.subWhA1, quantity: 30 });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('allocated');
    expect(res.body.data.source_warehouse_id).toBe(world.mainWhA);
    expect(res.body.data.dest_warehouse_id).toBe(world.subWhA1);

    // Physical stock unchanged by the reservation.
    expect(await getStock(world.itemId, world.mainWhA)).toBe(before);
  });

  test('cumulative allocated cannot exceed received (60 ok, 40 ok, 1 rejected)', async () => {
    await seedStock(world.itemId, world.mainWhA, 500);
    const { poId, detailId } = await approvedPoWithReceived(app, world, 100);

    const a1 = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 60 });
    expect(a1.status).toBe(201);

    const a2 = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA2, quantity: 40 });
    expect(a2.status).toBe(201);

    const a3 = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 1 });
    expect(a3.status).toBe(400);
    expect(a3.body.error.code).toBe('ALLOCATE_EXCEEDS_AVAILABLE');
  });

  test('cannot allocate before anything is received', async () => {
const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_id: world.supplierId,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 10, unit_code: world.unitCode }],
    });
    const poId = created.body.data.id;
    const detailId = created.body.data.details[0].id;
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);

    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ALLOCATE_EXCEEDS_RECEIVED');
  });

  test('allocation destination cannot be a main warehouse (DB trigger backstop)', async () => {
    await seedStock(world.itemId, world.mainWhA, 100);
    const { poId, detailId } = await approvedPoWithReceived(app, world, 50);
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.mainWhB, quantity: 5 });
    expect([400, 500]).toContain(res.status);
    if (res.status === 500) {
      // trigger exception surfaces as a server error â€” acceptable DB-level guard
      expect(JSON.stringify(res.body)).toMatch(/non-main|MAIN|warehouse/i);
    }
  });

  test('cross-department allocation rejected', async () => {
    await seedStock(world.itemId, world.mainWhA, 200);
    const { poId, detailId } = await approvedPoWithReceived(app, world, 20);
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhB, quantity: 5 });
    expect(res.status).toBe(400);
  });

  test('WM can allocate only to warehouses assigned to them', async () => {
    await seedStock(world.itemId, world.mainWhA, 300);
    const { poId, detailId } = await approvedPoWithReceived(app, world, 15);

    // subWhA1 IS assigned to wmMain â†’ allowed
    const ok = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 5 });
    expect(ok.status).toBe(201);

    // subWhA2 NOT assigned â†’ forbidden
    const denied = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA2, quantity: 5 });
    expect(denied.status).toBe(403);
  });

  test('forged detail_id from another PO rejected', async () => {
    await seedStock(world.itemId, world.mainWhA, 300);
    const other = await approvedPoWithReceived(app, world, 8);
    const target = await approvedPoWithReceived(app, world, 9);

    const res = await request(app)
      .post(`/api/purchase-orders/${target.poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: other.detailId, dest_warehouse_id: world.subWhA1, quantity: 2 });
    expect([400, 404]).toContain(res.status);
  });

  test('cancel allocation releases reserved quantity and updates status', async () => {
    await seedStock(world.itemId, world.mainWhA, 300);
    const { poId, detailId } = await approvedPoWithReceived(app, world, 50);

    const allocRes = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 25 });
    expect(allocRes.status).toBe(201);
    const allocId = allocRes.body.data.id;

    // Check detail before cancellation
    const poBefore = await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(Number(poBefore.body.data.details[0].quantity_allocated)).toBe(25);

    // Cancel allocation via DELETE
    const cancelRes = await request(app)
      .delete(`/api/purchase-orders/allocations/${allocId}`)
      .set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.released_quantity).toBe(25);

    // Check detail after cancellation — quantity_allocated is reset
    const poAfter = await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(Number(poAfter.body.data.details[0].quantity_allocated)).toBe(0);

    // Re-allocating the released quantity now succeeds
    const reAllocRes = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 25 });
    expect(reAllocRes.status).toBe(201);
  });
});

