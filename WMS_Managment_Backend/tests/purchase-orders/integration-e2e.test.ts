import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup, seedItem } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, seedStock, getStock, poTeardown, type PoWorld } from './helpers';

/**
 * End-to-end: Supplier -> PO -> Approval -> Partial receiving -> Confirm receipt
 * -> Close. Verifies every aggregate and physical stock figure along the way,
 * plus MR-workflow non-interference.
 *
 * This standalone PO has no linked Purchase Request, so `receive()` drafts NO
 * transfer (D8 auto-transfer is exercised in auto-transfer.test.ts) and its
 * received stock simply stays in the main warehouse as general stock.
 */

describe('Purchase orders — full lifecycle e2e', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
    world.users.supervisor.token = await login(app, world.users.supervisor);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('create → approve → receive 60/40 → confirm-receive → close', async () => {
    await seedStock(world.itemId, world.mainWhA, 200);
    const srcBefore = await getStock(world.itemId, world.mainWhA);

    // 1. CREATE draft
    const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 100, unit_code: world.unitCode, unit_price: 3 }],
    });
    expect(created.status).toBe(201);
    const poId = created.body.data.id;
    const detailId = created.body.data.details[0].id;

    // 2. APPROVE
    const approved = await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(approved.status).toBe(200);

    // 3. RECEIVE partial (60) then complete (40).
    const r1 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 60 }] });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('partially_received');
    expect(r1.body.data.auto_transfer_created).toBe(false);
    expect(r1.body.data.linked_transfer_id).toBeNull();
    const rvId = r1.body.data.transaction_id;

    const r2 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 40 }] });
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('received');

    expect(await getStock(world.itemId, world.mainWhA)).toBe(srcBefore + 100);

    // 4. CONFIRM RECEIPT — two-party: the PO creator (admin) may not confirm
    //    their own receipt; the receiving warehouse manager must.
    const selfConfirm = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(selfConfirm.status).toBe(403);

    const confirm = await request(app)
      .post(`/api/purchase-orders/${poId}/confirm-receive`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.receive_confirmed_by).toBe(world.users.wmMain.id);

    // Detail aggregates: received up to ordered; no allocation columns exist.
    const detail = (await pool.query(
      `SELECT quantity_ordered::float8 AS o, quantity_received::float8 AS r
       FROM purchase_order_details WHERE id = $1`, [detailId]
    )).rows[0];
    expect(detail).toEqual({ o: 100, r: 100 });
    expect(detail.r).toBeLessThanOrEqual(detail.o);

    // 5. CLOSE — no linked transfer exists so nothing blocks it.
    const closed = await request(app).post(`/api/purchase-orders/${poId}/close`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('closed');

    const finalPo = (await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.admin.token}`)).body.data;
    expect(finalPo.status).toBe('closed');
    expect(Number(finalPo.details[0].quantity_received)).toBe(100);
    void rvId;
  });

  test('material request workflow still issues stock independently of POs', async () => {
    // Supervisor creates an MR; WM approves + issues it — proving the demand-side
    // workflow coexists with purchase orders unchanged.
    // NOTE: the supervisor line-item hardening requires the item's home
    // warehouse to be one of the department's non-main warehouses, so this MR
    // uses a dedicated sub-warehouse item (unlike the PO items above).
    const mrItemId = await seedItem(world.catCode, world.unitCode, world.subWhA1, 0);
    await seedStock(mrItemId, world.mainWhA, 25);
    const beforeMain = await getStock(mrItemId, world.mainWhA);
    const beforeSub = await getStock(mrItemId, world.subWhA1);

    const mr = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${world.users.supervisor.token}`)
      .send({
        request_type: 'experiment',
        priority: 'normal',
        warehouse_id: world.subWhA1,
        notes: `${PO_TEST_PREFIX}mr_e2e`,
        items: [{ item_id: mrItemId, quantity: 5, unit_code: world.unitCode }],
      });
    expect(mr.status).toBe(201);
    const requestId = mr.body.data.id;

    const wmApprove = await request(app)
      .patch(`/api/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    expect(wmApprove.status).toBe(200);
    expect(wmApprove.body.data.status).toBe('wm_approved');

    const issueRes = await request(app)
      .post(`/api/requests/${requestId}/issue`)
      .set('Authorization', `Bearer ${world.users.wmMain.token}`);
    if (issueRes.status !== 200) {
      console.error('ISSUE FAILED', JSON.stringify(issueRes.body));
    }
    expect(issueRes.status).toBe(200);

    expect(await getStock(mrItemId, world.mainWhA)).toBe(beforeMain - 5);
    expect(await getStock(mrItemId, world.subWhA1)).toBe(beforeSub + 5);
  });

  test('audit trail records the full PO lifecycle', async () => {
    const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 4, unit_code: world.unitCode }],
    });
    const poId = created.body.data.id;
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE resource = 'purchase_orders' AND resource_id = $1 ORDER BY id`,
      [poId]
    );
    const actions = logs.rows.map(r => r.action);
    expect(actions).toContain('PO_CREATED');
    expect(actions).toContain('PO_APPROVED');
  });
});