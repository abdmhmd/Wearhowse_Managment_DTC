import request from 'supertest';
import { PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, poTeardown, type PoWorld } from './helpers';

/**
 * Purchase order CRUD: create validation, draft editing, scope-filtered reads.
 */

describe('Purchase orders â€” CRUD', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  describe('create', () => {
    test('admin creates a valid draft PO into the main warehouse (department derived)', async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: world.supplierName,
        warehouse_id: world.mainWhA,
        expected_date: '2030-01-01',
        notes: 'crud test',
        lines: [{ item_id: world.itemId, quantity_ordered: 100, unit_code: world.unitCode, unit_price: 5 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.po_number).toMatch(/^PO-\d{4}-\d{6}$/);
      expect(res.body.data.department_id).toBe(world.deptA);
      expect(res.body.data.details).toHaveLength(1);
      expect(Number(res.body.data.details[0].quantity_ordered)).toBe(100);
    });

    test('warehouse manager creates a PO for their own main warehouse', async () => {
      const res = await apiCreatePo(app, world.users.wmMain.token, {
        warehouse_id: world.mainWhA,
        lines: [{ item_id: world.itemId2, quantity_ordered: 10, unit_code: world.unitCode }],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.created_by).toBe(world.users.wmMain.id);
    });

    test('rejects receiving into a NON-main warehouse', async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        warehouse_id: world.subWhA1,
        lines: [{ item_id: world.itemId, quantity_ordered: 1, unit_code: world.unitCode }],
      });
      expect(res.status).toBe(400);
    });

    test('WM forged warehouse_id (other department main) is IGNORED — derived warehouse used instead', async () => {
      const res = await apiCreatePo(app, world.users.wmMain.token, {
        warehouse_id: world.mainWhB,
        lines: [{ item_id: world.itemId, quantity_ordered: 1, unit_code: world.unitCode }],
      });
      // The manager never picks the receiving warehouse anymore: the payload
      // value is discarded and the backend derives his own main warehouse.
      expect(res.status).toBe(201);
      expect(res.body.data.warehouse_id).toBe(world.mainWhA);
      expect(res.body.data.department_id).toBe(world.deptA);
    });

    test('rejects duplicate item lines', async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        warehouse_id: world.mainWhA,
        lines: [
          { item_id: world.itemId, quantity_ordered: 5, unit_code: world.unitCode },
          { item_id: world.itemId, quantity_ordered: 6, unit_code: world.unitCode },
        ],
      });
      expect(res.status).toBe(400);
    });

    test('rejects zero / negative quantities and empty lines', async () => {
      const zero = await apiCreatePo(app, world.users.admin.token, {
        warehouse_id: world.mainWhA,
        lines: [{ item_id: world.itemId, quantity_ordered: 0, unit_code: world.unitCode }],
      });
      expect(zero.status).toBe(400);

      const negative = await apiCreatePo(app, world.users.admin.token, {
        warehouse_id: world.mainWhA,
        lines: [{ item_id: world.itemId, quantity_ordered: -3, unit_code: world.unitCode }],
      });
      expect(negative.status).toBe(400);

      const empty = await apiCreatePo(app, world.users.admin.token, {
        warehouse_id: world.mainWhA,
        lines: [],
      });
      expect(empty.status).toBe(400);
    });

    test('rejects unknown item or invalid unit', async () => {
      const badItem = await apiCreatePo(app, world.users.admin.token, {
        warehouse_id: world.mainWhA,
        lines: [{ item_id: 99999999, quantity_ordered: 1, unit_code: world.unitCode }],
      });
      expect(badItem.status).toBe(400);

      const badUnit = await apiCreatePo(app, world.users.admin.token, {
        warehouse_id: world.mainWhA,
        lines: [{ item_id: world.itemId, quantity_ordered: 1, unit_code: 'NOPE' }],
      });
      expect(badUnit.status).toBe(400);
    });

    test('client-supplied department_id is ignored/derived â€” forged value has no effect', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${world.users.admin.token}`)
        .send({
          department_id: world.deptB,
          warehouse_id: world.mainWhA,
          lines: [{ item_id: world.itemId, quantity_ordered: 1, unit_code: world.unitCode }],
        });
      if (res.status === 201) {
        expect(res.body.data.department_id).toBe(world.deptA);
      } else {
        expect(res.status).toBe(400);
      }
    });

    test('admin must name the supplier (blank supplier_name rejected)', async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: '   ',
        warehouse_id: world.mainWhA,
        lines: [{ item_id: world.itemId, quantity_ordered: 1, unit_code: world.unitCode }],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('update (draft only)', () => {
    let poId: number;

    beforeAll(async () => {
const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: world.supplierName,
        warehouse_id: world.mainWhA,
        notes: 'before',
        lines: [{ item_id: world.itemId, quantity_ordered: 50, unit_code: world.unitCode }],
      });
      poId = res.body.data.id;
    });

    test('updates draft fields and replaces lines', async () => {
      const res = await request(app)
        .patch(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${world.users.admin.token}`)
        .send({
          notes: 'after',
          lines: [
            { item_id: world.itemId, quantity_ordered: 60, unit_code: world.unitCode },
            { item_id: world.itemId2, quantity_ordered: 40, unit_code: world.unitCode },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.notes).toBe('after');
      expect(res.body.data.details).toHaveLength(2);
      const line = res.body.data.details.find((d: any) => d.item_id === world.itemId);
      expect(Number(line.quantity_ordered)).toBe(60);
    });

    test('update is rejected once the PO is no longer draft', async () => {
      await request(app)
        .post(`/api/purchase-orders/${poId}/approve`)
        .set('Authorization', `Bearer ${world.users.admin.token}`);
      const res = await request(app)
        .patch(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${world.users.admin.token}`)
        .send({ notes: 'too late' });
      expect([400, 409]).toContain(res.status);
    });
  });

  describe('list + detail scoping', () => {
    let poA: number;
    beforeAll(async () => {
const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: world.supplierName,
        warehouse_id: world.mainWhB,
        lines: [{ item_id: world.itemId, quantity_ordered: 3, unit_code: world.unitCode }],
      });
      poA = res.body.data.id;
    });

    test('detail is visible to admin', async () => {
      const res = await request(app)
        .get(`/api/purchase-orders/${poA}`)
        .set('Authorization', `Bearer ${world.users.admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.warehouse_id).toBe(world.mainWhB);
    });

    test('detail is hidden (404) from WM of another warehouse', async () => {
      const res = await request(app)
        .get(`/api/purchase-orders/${poA}`)
        .set('Authorization', `Bearer ${world.users.wmMain.token}`);
      expect(res.status).toBe(404);
    });

    test('WM list contains only own-warehouse POs', async () => {
      const res = await request(app)
        .get('/api/purchase-orders')
        .set('Authorization', `Bearer ${world.users.wmMain.token}`);
      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.every((p: any) => p.warehouse_id === world.mainWhA)).toBe(true);
    });
  });
});

