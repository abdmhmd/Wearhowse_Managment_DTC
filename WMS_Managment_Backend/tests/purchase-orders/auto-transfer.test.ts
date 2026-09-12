import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup } from '../helpers';
import {
  PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, seedRoleUser, seedStock, getStock, poTeardown,
  type SeedUser, type PoWorld,
} from './helpers';

/**
 * [D8] PO receive auto-transfer suite.
 *
 * When a purchase order was generated from a department Purchase Request
 * (PR), `receive()` drafts a Transfer (TRF) to the request creator's UNIQUE
 * active sub-warehouse in the same department — in the SAME transaction as the
 * receiving voucher (RV). The movement only realises when a second user
 * confirms it via POST /api/purchase-orders/:id/confirm-transfer.
 *
 * Coverage:
 *   T1 full receive           -> RV + draft TRF; self-confirm 403; confirm by
 *                                another user moves stock main->sub; PO closes.
 *   T2 partial receives       -> one draft TRF per receive; confirm clears ALL.
 *   T3 standalone PO          -> never auto-transferred.
 *   T4 no destination (0)     -> receive fails, RV fully rolled back.
 *   T5 ambiguous destination  -> receive fails, RV fully rolled back.
 */

async function createPrLinkedPo(world: PoWorld, app: any, creatWM: { token: string }, deptMgr: { token: string }, adminUser: { token: string }, qty: number) {
  const pr = await request(app)
    .post('/api/purchase-requests')
    .set('Authorization', `Bearer ${creatWM.token}`)
    .send({
      warehouse_id: world.mainWhA,
      items: [{ item_id: world.itemId, quantity: qty, unit_code: world.unitCode }],
    });
  expect(pr.status).toBe(201);
  const requestId = pr.body.data.id;

  const deptOk = await request(app)
    .patch(`/api/purchase-requests/${requestId}/approve-dept`)
    .set('Authorization', `Bearer ${deptMgr.token}`);
  expect(deptOk.status).toBe(200);

  const adminOk = await request(app)
    .patch(`/api/purchase-requests/${requestId}/approve-admin`)
    .set('Authorization', `Bearer ${adminUser.token}`);
  expect(adminOk.status).toBe(200);
  const poId = adminOk.body.data.purchase_order_id;
  expect(poId).toBeDefined();

  const po = (await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${adminUser.token}`)).body.data;
  expect(po.purchase_request_id).toBe(requestId);
  expect(po.auto_transfer_created).toBe(false);
  expect(po.linked_transfer_id).toBeNull();
  return { poId, requestId, detailId: po.details[0].id };
}

describe('Purchase orders — D8 auto-transfer on PR-linked reception', () => {
  let app: any;
  let world: PoWorld;
  let admin: { id: number; token: string };
  let creatWM: SeedUser;
  let creatWM0: SeedUser;
  let creatWM2: SeedUser;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
    world.users.deptMgr.token = await login(app, world.users.deptMgr);
    admin = { id: world.users.admin.id, token: world.users.admin.token };
    await seedStock(world.itemId, world.mainWhA, 100);

    creatWM = await seedRoleUser('sub_warehouse_manager', { department_id: world.deptA, warehouse_ids: [world.mainWhA, world.subWhA1] });
    creatWM.token = await login(app, creatWM);
    // PR creator with NO non-main assignment -> destination cannot be derived.
    creatWM0 = await seedRoleUser('sub_warehouse_manager', { department_id: world.deptA, warehouse_ids: [world.mainWhA] });
    creatWM0.token = await login(app, creatWM0);
    // PR creator assigned TWO non-main warehouses -> ambiguous.
    creatWM2 = await seedRoleUser('sub_warehouse_manager', { department_id: world.deptA, warehouse_ids: [world.mainWhA, world.subWhA1, world.subWhA2] });
    creatWM2.token = await login(app, creatWM2);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('T1: full receive drafts a TRF; self-confirm 403; other-user confirm moves stock; then PO closes', async () => {
    const { poId, detailId } = await createPrLinkedPo(world, app, creatWM, world.users.deptMgr, admin, 10);

    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.wmMain.token}`);

    const srcBefore = await getStock(world.itemId, world.mainWhA);
    const dstBefore = await getStock(world.itemId, world.subWhA1);

    const received = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 10 }] });
    expect(received.status).toBe(200);
    expect(received.body.data.status).toBe('received');
    expect(received.body.data.auto_transfer_created).toBe(true);
    expect(received.body.data.linked_transfer_id).toBeDefined();
    expect(received.body.data.linked_transfer_no).toMatch(/^TRF-/);
    expect(received.body.data.linked_transfer_destination_warehouse_id).toBe(world.subWhA1);

    // RV landed (stock entered main) but the TRF is still only a draft.
    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore + 10);
    expect(await getStock(world.itemId, world.subWhA1)).toBe(dstBefore);

    // The PO cannot close while the drafted movement is pending.
    const blockedClose = await request(app)
      .post(`/api/purchase-orders/${poId}/close`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(blockedClose.status).toBe(400);
    expect(JSON.stringify(blockedClose.body)).toMatch(/PO_CANNOT_CLOSE|has not been confirmed/i);

    // D9: the user who executed the transfer may not confirm their own movement.
    const self = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-transfer`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(self.status).toBe(403);

    // A DIFFERENT user confirms -> stock leaves main and enters the sub-warehouse.
    const confirm = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-transfer`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.status).toBe('approved');
    expect(confirm.body.data.transfer_count).toBe(1);
    expect(confirm.body.data.po.linked_transfer_status).toBe('approved');

    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore);
    expect(await getStock(world.itemId, world.subWhA1)).toBe(dstBefore + 10);

    // Re-confirming the same transfer again = already processed.
    const again = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-transfer`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(again.status).toBe(409);

    // Close is now allowed (no draft TRF remains).
    const closed = await request(app)
      .post(`/api/purchase-orders/${poId}/close`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('closed');
  });

  test('T2: partial receives draft one TRF each; a single confirm clears ALL pending', async () => {
    const { poId, detailId } = await createPrLinkedPo(world, app, creatWM, world.users.deptMgr, admin, 20);
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.wmMain.token}`);

    const srcBefore = await getStock(world.itemId, world.mainWhA);
    const dstBefore = await getStock(world.itemId, world.subWhA1);

    const r1 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 8 }] });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('partially_received');
    expect(r1.body.data.auto_transfer_created).toBe(true);

    const r2 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 12 }] });
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('received');
    expect(r2.body.data.auto_transfer_created).toBe(true);

    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore + 20);
    expect(await getStock(world.itemId, world.subWhA1)).toBe(dstBefore);

    const confirm = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-transfer`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.status).toBe('approved');
    expect(confirm.body.data.transfer_count).toBe(2);

    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore);
    expect(await getStock(world.itemId, world.subWhA1)).toBe(dstBefore + 20);

    const closed = await request(app)
      .post(`/api/purchase-orders/${poId}/close`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(closed.status).toBe(200);
  });

  test('T3: standalone PO (no PR link) never auto-transfers', async () => {
    const created = await apiCreatePo(app, admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 5, unit_code: world.unitCode }],
    });
    expect(created.status).toBe(201);
    const poId = created.body.data.id;
    const detailId = created.body.data.details[0].id;

    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${admin.token}`);
    const received = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 5 }] });
    expect(received.status).toBe(200);
    expect(received.body.data.auto_transfer_created).toBe(false);
    expect(received.body.data.linked_transfer_id).toBeNull();

    const noTransfer = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-transfer`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(noTransfer.status).toBe(400);
    expect(JSON.stringify(noTransfer.body)).toMatch(/no linked transfer/i);
  });

  test('T4: PR creator with no sub-warehouse -> receive fails and RV rolls back', async () => {
    const { poId, detailId } = await createPrLinkedPo(world, app, creatWM0, world.users.deptMgr, admin, 10);
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.wmMain.token}`);

    const srcBefore = await getStock(world.itemId, world.mainWhA);

    const received = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 10 }] });
    expect(received.status).toBe(400);
    expect(JSON.stringify(received.body)).toMatch(/NO_TRANSFER_DESTINATION|no active sub-warehouse/i);

    // Rolled back: no stock movement, no RV, status unchanged.
    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore);
    const po = (await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.wmMain.token}`)).body.data;
    expect(po.status).toBe('approved');
    const txn = await pool.query(
      `SELECT count(*)::int AS n FROM transactions WHERE purchase_order_id = $1 AND type = 'RV'`,
      [poId]
    );
    expect(txn.rows[0].n).toBe(0);
  });

  test('T5: PR creator with multiple sub-warehouses -> receive fails and RV rolls back', async () => {
    const { poId, detailId } = await createPrLinkedPo(world, app, creatWM2, world.users.deptMgr, admin, 10);
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.wmMain.token}`);

    const srcBefore = await getStock(world.itemId, world.mainWhA);

    const received = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 10 }] });
    expect(received.status).toBe(400);
    expect(JSON.stringify(received.body)).toMatch(/AMBIGUOUS_TRANSFER_DESTINATION|multiple sub-warehouses/i);

    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore);
    const po = (await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.wmMain.token}`)).body.data;
    expect(po.status).toBe('approved');
  });
});