import request from 'supertest';
import { pool } from '../../src/config/database';
import { PO_TEST_PREFIX, seedPoWorld, seedStock, getStock, login, apiCreatePo, poTeardown, type PoWorld } from './helpers';

/**
 * Partial receiving: 100 ordered â†’ receive 60 (partially_received) â†’ receive
 * 40 (received). Over-receiving (101 cumulative, or 60+50) is rejected. RV
 * vouchers are created and physical stock increases in the MAIN warehouse only.
 */

describe('Purchase orders â€” partial receiving', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('60 then 40 reaches received=100 with status transitions; over-receive rejected', async () => {
    const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 100, unit_code: world.unitCode, unit_price: 2 }],
    });
    expect(created.status).toBe(201);
    const poId = created.body.data.id;
    const detailId = created.body.data.details[0].id;

    // approve
    const approved = await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    expect(approved.status).toBe(200);

    const stockBefore = await getStock(world.itemId, world.mainWhA);

    // receive 60
    const r1 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 60 }] });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('partially_received');
    expect(r1.body.data.transaction_no).toMatch(/^RV-/);

    let po = (await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.admin.token}`)).body.data;
    expect(Number(po.details[0].quantity_received)).toBe(60);

    // physical stock increased by 60 in the main warehouse
    expect(await getStock(world.itemId, world.mainWhA)).toBe(stockBefore + 60);

    // over-receive attempt: 101 cumulative via a second line of 50 (60+50 > 100)
    const rOver = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 50 }] });
    expect(rOver.status).toBe(400);

    // receive the remaining 40
    const r2 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 40 }] });
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('received');

    po = (await request(app).get(`/api/purchase-orders/${poId}`).set('Authorization', `Bearer ${world.users.admin.token}`)).body.data;
    expect(Number(po.details[0].quantity_received)).toBe(100);

    // fully received â€” any further receive is rejected
    const r3 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 1 }] });
    expect(r3.status).toBe(400);

    // total physical stock now +100 vs pre-receive baseline
    expect(await getStock(world.itemId, world.mainWhA)).toBe(stockBefore + 100);
  });

  test('multi-line PO: partial per-line receiving works independently', async () => {
const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhA,
      lines: [
        { item_id: world.itemId, quantity_ordered: 10, unit_code: world.unitCode },
        { item_id: world.itemId2, quantity_ordered: 20, unit_code: world.unitCode },
      ],
    });
    const poId = created.body.data.id;
    const [d1, d2] = created.body.data.details.map((d: any) => d.id);

    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);

    // receive both lines partially in one call
    const r1 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: d1, quantity: 4 }, { detail_id: d2, quantity: 15 }] });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('partially_received');

    // complete line 1 only â†’ still partially_received
    const r2 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: d1, quantity: 6 }] });
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('partially_received');

    // complete line 2 â†’ received
    const r3 = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: d2, quantity: 5 }] });
    expect(r3.status).toBe(200);
    expect(r3.body.data.status).toBe('received');
  });

  test('RV voucher is linked to the purchase order and stock_movements recorded', async () => {
const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId, quantity_ordered: 7, unit_code: world.unitCode }],
    });
    const poId = created.body.data.id;
    const detailId = created.body.data.details[0].id;
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    const rec = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 7 }] });
    expect(rec.status).toBe(200);

    const txn = await pool.query(
      'SELECT * FROM transactions WHERE id = $1', [rec.body.data.transaction_id]
    );
    expect(txn.rows[0].type).toBe('RV');
    expect(txn.rows[0].status).toBe('approved');
    expect(txn.rows[0].purchase_order_id).toBe(poId);
    expect(txn.rows[0].warehouse_id).toBe(world.mainWhA);

    const movements = await pool.query(
      'SELECT * FROM stock_movements WHERE transaction_id = $1', [rec.body.data.transaction_id]
    );
    expect(movements.rows.length).toBeGreaterThanOrEqual(1);
    expect(movements.rows[0].movement_type).toBe('IN');
  });
});

