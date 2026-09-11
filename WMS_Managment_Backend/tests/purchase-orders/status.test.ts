import request from 'supertest';
import { cleanup } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, poTeardown, type PoWorld } from './helpers';

/**
 * Server-side PO status machine: valid transitions succeed, invalid ones are
 * rejected (draftâ†’received, receivedâ†’draft, closed/cancelled terminal states).
 */

describe('Purchase orders â€” status machine', () => {
  let app: any;
  let world: PoWorld;

  const makePo = async (): Promise<number> => {
const res = await apiCreatePo(app, world.users.admin.token, {
      supplier_id: world.supplierId,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 10, unit_code: world.unitCode }],
    });
    expect(res.status).toBe(201);
    return res.body.data.id;
  };

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('draft â†’ approved succeeds', async () => {
    const poId = await makePo();
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.approved_by).toBe(world.users.admin.id);
    expect(res.body.data.approved_at).toBeTruthy();
  });

  test('double approval rejected (approved â†’ approved invalid)', async () => {
    const poId = await makePo();
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(res.status).toBe(400);
  });

  test('draft cannot be closed or received', async () => {
    const poId = await makePo();
    const closeRes = await request(app).post(`/api/purchase-orders/${poId}/close`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(closeRes.status).toBe(400);

    const receiveRes = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: 1, quantity: 1 }] });
    // detail_id may not even exist; either way it must not succeed with a draft
    expect([400, 404]).toContain(receiveRes.status);
  });

  test('draft â†’ cancelled works; cancelled is terminal', async () => {
    const poId = await makePo();
    const res = await request(app).post(`/api/purchase-orders/${poId}/cancel`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelled_by).toBe(world.users.admin.id);

    const reApprove = await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(reApprove.status).toBe(400);

    const reCancel = await request(app).post(`/api/purchase-orders/${poId}/cancel`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(reCancel.status).toBe(400);
  });

  test('closed is terminal', async () => {
    const poId = await makePo();
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    const detailIdRes = await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.admin.token}`);
    const detailId = detailIdRes.body.data.details[0].id;
    await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 10 }] });
    expect((await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.admin.token}`)).body.data.status).toBe('received');

    const closeRes = await request(app).post(`/api/purchase-orders/${poId}/close`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('closed');

    const cancelAfterClose = await request(app).post(`/api/purchase-orders/${poId}/cancel`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(cancelAfterClose.status).toBe(400);
  });

  test('WM can approve a PO in their scope', async () => {
    const poId = await makePo();
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });
});

