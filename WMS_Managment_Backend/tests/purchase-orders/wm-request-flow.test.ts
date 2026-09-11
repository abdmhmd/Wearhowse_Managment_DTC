import request from 'supertest';
import { pool } from '../../src/config/database';
import { cleanup } from '../helpers';
import {
  PO_TEST_PREFIX, seedPoWorld, login, apiCreatePo,
  type PoWorld,
} from './helpers';

/**
 * Warehouse Manager purchase-REQUEST workflow.
 *
 * A warehouse manager expresses a pure material request (item + quantity +
 * unit + notes). The receiving MAIN warehouse is DERIVED SERVER-SIDE from the
 * authenticated account (department main warehouse first, then a uniquely
 * assigned active main via user_warehouses). Client-supplied warehouse_id /
 * department_id / supplier_id / unit_price are ignored or rejected.
 *
 * Test mapping (task spec):
 *   T1  create request with item+quantity          -> 201 draft
 *   T2  warehouse auto-derived                     -> asserted everywhere
 *   T3/T6  forged department_id                    -> rejected or ignored
 *   T4/T5  forged warehouse_id                     -> ignored
 *   T7  supplier omitted                           -> allowed (NULL)
 *   T8  unit_price omitted                         -> defaults to 0
 *   T9  forged supplier stripped                   -> NULL stored
 *   T10 forged price zeroed                        -> 0 stored
 *   T11 admin procurement path unchanged           -> supplier+price honored
 */

describe('Purchase orders — WM purchase-request workflow', () => {
  let app: any;
  let world: PoWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPoWorld();
    world.users.admin.token = await login(app, world.users.admin);
    world.users.wmMain.token = await login(app, world.users.wmMain);
  });

  afterAll(async () => { await cleanup(PO_TEST_PREFIX); });

  // ── helpers ────────────────────────────────────────────────────────────────
  const itemLine = () => ({ item_id: world.itemId, quantity_ordered: 10, unit_code: world.unitCode });

  async function seedWm(opts: { department_id?: number | null; warehouse_ids?: number[] }) {
    const password = 'testPass123';
    const { hashPassword } = await import('../../src/utils/crypto');
    const { shortId } = await import('../helpers');
    const username = `${PO_TEST_PREFIX}wm_${shortId()}`;
    const u = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
       VALUES ($1, $2, $3, 'sub_warehouse_manager', $4, true) RETURNING id`,
      [username, await hashPassword(password), username, opts.department_id ?? null]
    );
    const id = u.rows[0].id;
    for (const wh of opts.warehouse_ids ?? []) {
      await pool.query('INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, wh]);
    }
    const token = await login(app, { id, username, password, token: '' });
    return { id, token };
  }

  // ── T1 + T2 ────────────────────────────────────────────────────────────────
  test('T1+T2: WM submits a material request; receiving warehouse auto-derived', async () => {
    // wmMain has NO user.department_id but exactly ONE assigned main -> fallback rule
    const res = await apiCreatePo(app, world.users.wmMain.token, {
      notes: 'need materials',
      lines: [itemLine()],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.warehouse_id).toBe(world.mainWhA);       // derived, not chosen
    expect(res.body.data.department_id).toBe(world.deptA);        // derived from warehouse
    expect(res.body.data.supplier_id).toBeNull();                 // T7: supplier not required
    expect(Number(res.body.data.details[0].unit_price)).toBe(0);  // T8: price not required
    expect(res.body.data.created_by).toBe(world.users.wmMain.id);
  });

  // ── T2 (primary rule): department -> department main warehouse ────────────
  test('department rule: WM with department gets his DEPARTMENT main warehouse without any assignment', async () => {
    const wm = await seedWm({ department_id: world.deptA });
    const res = await apiCreatePo(app, wm.token, {
      lines: [{ item_id: world.itemId2, quantity_ordered: 5, unit_code: world.unitCode }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(world.mainWhA);
    expect(res.body.data.department_id).toBe(world.deptA);
  });

  // ── T3 / T6: forged department_id ──────────────────────────────────────────
  test('T3+T6: forged department_id can never steer another department', async () => {
    const res = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({
        department_id: world.deptB,
        lines: [itemLine()],
      });
    if (res.status === 201) {
      expect(res.body.data.department_id).toBe(world.deptA);
      expect(res.body.data.warehouse_id).toBe(world.mainWhA);
    } else {
      expect(res.status).toBe(400);
    }
  });

  // ── T4 / T5: forged warehouse_id ───────────────────────────────────────────
  test('T4: forged foreign main warehouse_id is ignored (derived used instead)', async () => {
    const res = await apiCreatePo(app, world.users.wmMain.token, {
      warehouse_id: world.mainWhB,
      lines: [itemLine()],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(world.mainWhA);
  });

  test('T5: forged nonexistent warehouse_id=999999 is ignored', async () => {
    const res = await apiCreatePo(app, world.users.wmMain.token, {
      warehouse_id: 999999,
      lines: [itemLine()],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(world.mainWhA);
  });

  // ── T9: forged supplier stripped ───────────────────────────────────────────
  test('T9: raw-payload supplier manipulation is neutralized (stored NULL)', async () => {
    const res = await apiCreatePo(app, world.users.wmMain.token, {
      supplier_id: 999,
      lines: [itemLine()],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.supplier_id).toBeNull();
  });

  // ── T10: forged price zeroed ───────────────────────────────────────────────
  test('T10: raw-payload unit_price manipulation is neutralized (stored 0)', async () => {
    const res = await apiCreatePo(app, world.users.wmMain.token, {
      lines: [{ ...itemLine(), unit_price: 999999 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.details[0].unit_price)).toBe(0);
  });

  // ── error paths: ambiguity must NOT be silently resolved ──────────────────
  test('WM with no department and no assigned main warehouse -> clear validation error', async () => {
    const wm = await seedWm({});
    const res = await apiCreatePo(app, wm.token, { lines: [itemLine()] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/main warehouse/i);
  });

  test('WM whose department lacks an active main warehouse -> clear validation error', async () => {
    const deptC = await (async () => {
      const { shortId } = await import('../helpers');
      const r = await pool.query(
        `INSERT INTO departments (code, name_ar, name_en) VALUES ($1,$2,$2) RETURNING id`,
        [`${PO_TEST_PREFIX}deptC_${shortId()}`, `${PO_TEST_PREFIX}deptC`]
      );
      return r.rows[0].id;
    })();
    const wm = await seedWm({ department_id: deptC });
    const res = await apiCreatePo(app, wm.token, { lines: [itemLine()] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/active main warehouse/i);
  });

  test('WM assigned to TWO different main warehouses -> ambiguous error (never silent choice)', async () => {
    const wm = await seedWm({ warehouse_ids: [world.mainWhA, world.mainWhB] });
    const res = await apiCreatePo(app, wm.token, { lines: [itemLine()] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/[Aa]mbiguous|multiple main warehouses/i);
  });

  // ── regression: explicit null optionals (exact UI payload) ─────────────────
  test('regression: WM UI payload with notes=null and expected_date=null creates OK (was HTTP 400)', async () => {
    const res = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${world.users.wmMain.token}`)
      .send({
        notes: null,
        expected_date: null,
        lines: [itemLine()],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(world.mainWhA);
    expect(res.body.data.supplier_id).toBeNull();
  });

  // ── validation guards ──────────────────────────────────────────────────────
  test('missing item_id -> rejected', async () => {
    const res = await apiCreatePo(app, world.users.wmMain.token, {
      lines: [{ quantity_ordered: 5, unit_code: world.unitCode } as any],
    });
    expect(res.status).toBe(400);
  });

  test('zero and negative quantity -> rejected', async () => {
    const zero = await apiCreatePo(app, world.users.wmMain.token, {
      lines: [{ ...itemLine(), quantity_ordered: 0 }],
    });
    expect(zero.status).toBe(400);
    const neg = await apiCreatePo(app, world.users.wmMain.token, {
      lines: [{ ...itemLine(), quantity_ordered: -2 }],
    });
    expect(neg.status).toBe(400);
  });

  // ── T11: procurement/admin path unchanged ──────────────────────────────────
  test('T11: admin still controls warehouse + supplier + unit_price', async () => {
    const res = await apiCreatePo(app, world.users.admin.token, {
      warehouse_id: world.mainWhA,
      supplier_id: world.supplierId,
      notes: 'procurement order',
      lines: [{ item_id: world.itemId, quantity_ordered: 25, unit_code: world.unitCode, unit_price: 12.5 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(world.mainWhA);
    expect(res.body.data.supplier_id).toBe(world.supplierId);
    expect(Number(res.body.data.details[0].unit_price)).toBe(12.5);
  });

  test('admin still requires an explicit valid main warehouse (unchanged)', async () => {
    const res = await apiCreatePo(app, world.users.admin.token, {
      lines: [itemLine()],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/warehouse_id is required/i);
  });
});
