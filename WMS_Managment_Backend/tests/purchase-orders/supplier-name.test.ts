import request from 'supertest';
import { pool } from '../../src/config/database';
import {
  PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo, poTeardown,
  type PoWorld,
} from './helpers';

/**
 * Phase 3 / D6 — the suppliers entity is gone. Purchase orders carry a
 * free-text supplier_name instead of a suppliers.supplier_id FK.
 *
 * Functional: admin POs must name the supplier (trimmed), managers still
 * express pure material requests (client supplier_name stripped to NULL),
 * supplier_name is searchable and updatable on drafts.
 * Structural: information_schema guards that the suppliers table, the
 * purchase_orders.supplier_id column and every suppliers:* permission no
 * longer exist.
 */
describe('Purchase orders — supplier free-text (Phase 3 / D6)', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
  });

  afterAll(async () => { await poTeardown(PO_TEST_PREFIX); });

  const itemLine = () => ({ item_id: world.itemId, quantity_ordered: 10, unit_code: world.unitCode });

  // ── Structural: the suppliers entity is fully removed ───────────────────
  describe('schema no longer references suppliers', () => {
    test('the suppliers table does not exist', async () => {
      const res = await pool.query("SELECT to_regclass('public.suppliers') AS rel");
      expect(res.rows[0].rel).toBeNull();
    });

    test('purchase_orders has no supplier_id column', async () => {
      const res = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'purchase_orders' AND column_name = 'supplier_id'`
      );
      expect(res.rows[0].n).toBe(0);
    });

    test('purchase_orders.supplier_name exists, is NOT NULL and defaults to empty string', async () => {
      const res = await pool.query(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_name = 'purchase_orders' AND column_name = 'supplier_name'`
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].is_nullable).toBe('NO');
      expect(res.rows[0].column_default).toBe("''::text");
    });

    test('no suppliers:* permissions or role grants remain', async () => {
      const res = await pool.query(
        `SELECT count(*)::int AS n FROM permissions WHERE code LIKE 'suppliers:%'`
      );
      expect(res.rows[0].n).toBe(0);
      const grants = await pool.query(
        `SELECT count(*)::int AS n FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
          WHERE p.code LIKE 'suppliers:%'`
      );
      expect(grants.rows[0].n).toBe(0);
    });
  });

  // ── Functional: admin path carries the supplier name ────────────────────
  describe('admin procurement path', () => {
    test('creates a PO with the supplier name stored verbatim', async () => {
      const name = 'Yamama Steel Co / شركة اليمامة للصلب';
      const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: name,
        warehouse_id: world.mainWhA,
        lines: [itemLine()],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.supplier_name).toBe(name);
    });

    test('trims surrounding whitespace from supplier_name', async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: "  Al-Noor Trading Co  ",
        warehouse_id: world.mainWhA,
        lines: [itemLine()],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.supplier_name).toBe('Al-Noor Trading Co');
    });

    test('rejects an admin PO with no supplier_name', async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        warehouse_id: world.mainWhA,
        lines: [itemLine()],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/must name the supplier/i);
    });

    test('rejects a blank/whitespace-only supplier_name', async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: '   ',
        warehouse_id: world.mainWhA,
        lines: [itemLine()],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/must name the supplier/i);
    });

    test('rejects a supplier_name longer than 255 characters', async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: 'X'.repeat(256),
        warehouse_id: world.mainWhA,
        lines: [itemLine()],
      });
      expect(res.status).toBe(400);
    });
  });

  // ── Functional: manager requests never carry a supplier ──────────────────
  describe('material-request path', () => {
    test('WM request stores supplier_name as NULL even when a name is sent', async () => {
      const res = await apiCreatePo(app, world.users.wmMain.token, {
        supplier_name: 'Forged Supplier Name',
        lines: [itemLine()],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.supplier_name).toBeNull();
    });
  });

  // ── Functional: filtering + updating ──────────────────────────────────────
  describe('filtering and updates', () => {
    let poId: number;

    beforeAll(async () => {
      const res = await apiCreatePo(app, world.users.admin.token, {
        supplier_name: 'Gulf Contracting Establishment',
        warehouse_id: world.mainWhA,
        notes: 'for supplier filter',
        lines: [itemLine()],
      });
      expect(res.status).toBe(201);
      poId = res.body.data.id;
    });

    test('list can filter by supplier_name', async () => {
      const res = await request(app)
        .get('/api/purchase-orders')
        .query({ supplier_name: 'Gulf Contracting' })
        .set('Authorization', `Bearer ${world.users.admin.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((po: any) => po.id);
      expect(ids).toContain(poId);
    });

    test('search term matches the supplier name', async () => {
      const res = await request(app)
        .get('/api/purchase-orders')
        .query({ search: 'Contracting Establishment' })
        .set('Authorization', `Bearer ${world.users.admin.token}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.items.map((po: any) => po.id);
      expect(ids).toContain(poId);
    });

    test('updating a draft PO replaces the supplier name', async () => {
      const res = await request(app)
        .patch(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${world.users.admin.token}`)
        .send({ supplier_name: 'Renamed Trading House' });
      expect(res.status).toBe(200);
      expect(res.body.data.supplier_name).toBe('Renamed Trading House');
    });

    test('updating a draft PO with an empty supplier_name clears it to null', async () => {
      const res = await request(app)
        .patch(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${world.users.admin.token}`)
        .send({ supplier_name: '   ' });
      expect(res.status).toBe(200);
      expect(res.body.data.supplier_name).toBeNull();
    });
  });
});