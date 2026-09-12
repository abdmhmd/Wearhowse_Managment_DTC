import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup } from '../helpers';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, seedStock, getStock, poTeardown, type PoWorld } from './helpers';

/**
 * Atomicity: any failure inside receive/transfer must roll back EVERYTHING â€”
 * stock, quantities, statuses, transactions. No partial state may remain.
 */

async function approvedPo(app: any, world: PoWorld, qty: number) {
const created = await apiCreatePo(app, world.users.admin.token, {
    supplier_name: world.supplierName,
    warehouse_id: world.mainWhA,
    lines: [{ item_id: world.itemId, quantity_ordered: qty, unit_code: world.unitCode }],
  });
  const poId = created.body.data.id;
  const detailId = created.body.data.details[0].id;
  await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
  return { poId, detailId };
}

describe('Purchase orders â€” atomicity / rollback', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  test('multi-line receive with a foreign detail_id rolls back the WHOLE voucher', async () => {
    const { poId, detailId } = await approvedPo(app, world, 30);
    // A second, unrelated PO whose detail does not belong to poId.
    const otherPo = await approvedPo(app, world, 5);

    const stockBefore = await getStock(world.itemId, world.mainWhA);
    const txnCountBefore = (await pool.query(
      `SELECT count(*)::int AS n FROM transactions WHERE purchase_order_id = $1`, [poId]
    )).rows[0].n;

    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [
        { detail_id: detailId, quantity: 10 },
        { detail_id: otherPo.detailId, quantity: 1 }, // belongs to another PO
      ]});
    expect(res.status).toBe(404);

    // Nothing changed.
    expect(await getStock(world.itemId, world.mainWhA)).toBe(stockBefore);
    expect((await pool.query(`SELECT count(*)::int AS n FROM transactions WHERE purchase_order_id = $1`, [poId])).rows[0].n).toBe(txnCountBefore);
    expect(Number((await pool.query('SELECT quantity_received::float8 AS q FROM purchase_order_details WHERE id = $1', [detailId])).rows[0].q)).toBe(0);
    expect((await pool.query('SELECT status::text AS s FROM purchase_orders WHERE id = $1', [poId])).rows[0].s).toBe('approved');
  });

  test('engine-level receiving failure leaves no draft transaction or stock change behind', async () => {
    // Deterministic engine-level failure: swap the stored detail unit to a REAL
    // but unrelated unit after approval so the RV engine's unit validation
    // rejects the line INSIDE approveTransaction â€” i.e. AFTER createDraft has
    // already inserted header + details.
    const { seedUnit } = await import('../helpers');
    const foreignUnit = await seedUnit();
    const { poId, detailId } = await approvedPo(app, world, 12);
    await pool.query('UPDATE purchase_order_details SET unit_code = $2 WHERE id = $1', [detailId, foreignUnit]);

    const stockBefore = await getStock(world.itemId, world.mainWhA);
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 5 }] });
    expect(res.status).toBe(400);

    // Rollback verified across all four surfaces:
    expect(await getStock(world.itemId, world.mainWhA)).toBe(stockBefore);
    expect((await pool.query('SELECT quantity_received::float8 AS q FROM purchase_order_details WHERE id = $1', [detailId])).rows[0].q).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM transactions WHERE purchase_order_id = $1', [poId])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT status::text AS s FROM purchase_orders WHERE id = $1', [poId])).rows[0].s).toBe('approved');
  });

  test('transfer failure rolls back allocation bookkeeping AND destination credit', async () => {
    await seedStock(world.itemId2, world.mainWhA, 100);
const created = await apiCreatePo(app, world.users.admin.token, {
      supplier_name: world.supplierName,
      warehouse_id: world.mainWhA,
      lines: [{ item_id: world.itemId2, quantity_ordered: 40, unit_code: world.unitCode }],
    });
    const poId = created.body.data.id;
    const detailId = created.body.data.details[0].id;
    await request(app).post(`/api/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${world.users.admin.token}`);
    await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ lines: [{ detail_id: detailId, quantity: 40 }] });
    const alloc = await request(app)
      .post(`/api/purchase-orders/${poId}/allocations`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ detail_id: detailId, dest_warehouse_id: world.subWhA1, quantity: 25 });
    const allocationId = alloc.body.data.id;

    // Corrupt the stored detail unit (real unit, invalid for the item) so the
    // TRF engine rejects the line mid-approval (after the draft exists).
    const { seedUnit } = await import('../helpers');
    const foreignUnit2 = await seedUnit();
    await pool.query('UPDATE purchase_order_details SET unit_code = $2 WHERE id = $1', [detailId, foreignUnit2]);

    const dstBefore = await getStock(world.itemId2, world.subWhA1);
    const srcBefore = await getStock(world.itemId2, world.mainWhA);

    const res = await request(app)
      .post(`/api/purchase-orders/allocations/${allocationId}/transfer`)
      .set('Authorization', `Bearer ${world.users.admin.token}`)
      .send({ quantity: 10 });
    expect(res.status).toBe(400);

    expect(await getStock(world.itemId2, world.subWhA1)).toBe(dstBefore);
    expect(await getStock(world.itemId2, world.mainWhA)).toBe(srcBefore);
    const row = (await pool.query(
      'SELECT quantity_transferred::float8 AS qt, status::text AS s, transfer_transaction_id FROM purchase_order_allocations WHERE id = $1',
      [allocationId]
    )).rows[0];
    expect(Number(row.qt)).toBe(0);
    expect(row.s).toBe('allocated');
    expect(row.transfer_transaction_id).toBeNull();
    expect((await pool.query('SELECT count(*)::int AS n FROM transactions WHERE purchase_order_id = $1 AND type = \'TRF\'', [poId])).rows[0].n).toBe(0);
  });
});

