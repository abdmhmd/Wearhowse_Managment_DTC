import { pool } from '../../src/config/database';
import { PR_TEST_PREFIX, seedPrWorld, login, apiCreatePr, apiPatchPr, prTeardown, validPrBody, type PrWorld } from './helpers';

describe('Purchase requests — auto-PO on admin approval', () => {
  let app: any;
  let world: PrWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPrWorld();
    for (const u of Object.values(world.users)) u.token = await login(app, u);
  });

  afterAll(async () => { await prTeardown(PR_TEST_PREFIX); });

  async function createPrAndDeptApprove(): Promise<any> {
    const body = validPrBody(world.mainWhA, world.itemId, world.itemId2, world.unitCode);
    const created = await apiCreatePr(app, world.users.wmA.token, body);
    expect(created.status).toBe(201);
    const pr = created.body.data;
    const dept = await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);
    expect(dept.status).toBe(200);
    return pr;
  }

  test('PO is created as a draft with supplier_name empty, correct warehouse/dept and copied items', async () => {
    const pr = await createPrAndDeptApprove();

    const res = await apiPatchPr(app, world.users.admin.token, `/${pr.id}/approve-admin`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('admin_approved');

    const poRes = await pool.query(
      `SELECT po.* FROM purchase_orders po
       JOIN purchase_requests pr ON pr.purchase_order_id = po.id
       WHERE pr.id = $1`,
      [pr.id]
    );
    expect(poRes.rows).toHaveLength(1);
    const po = poRes.rows[0];
    expect(po.status).toBe('draft');
    expect(po.supplier_name).toBe('');
    expect(po.warehouse_id).toBe(world.mainWhA);
    expect(po.department_id).toBe(world.deptA);
    expect(po.po_number).toMatch(/^PO-\d{4}-\d{6}$/);

    const details = await pool.query(
      'SELECT item_id, quantity_ordered, unit_code, unit_price FROM purchase_order_details WHERE po_id = $1 ORDER BY id',
      [po.id]
    );
    expect(details.rows).toHaveLength(2);
    expect(details.rows[0].item_id).toBe(world.itemId);
    expect(Number(details.rows[0].quantity_ordered)).toBe(10);
    expect(details.rows[0].unit_code).toBe(world.unitCode);
    expect(Number(details.rows[0].unit_price)).toBe(0);
    expect(details.rows[1].item_id).toBe(world.itemId2);
    expect(Number(details.rows[1].quantity_ordered)).toBe(5);
  });

  test('request.purchase_order_id links to the created PO', async () => {
    const pr = await createPrAndDeptApprove();
    const res = await apiPatchPr(app, world.users.admin.token, `/${pr.id}/approve-admin`);
    const poRes = await pool.query(
      'SELECT id, po_number FROM purchase_orders WHERE id = $1',
      [res.body.data.purchase_order_id]
    );
    expect(poRes.rows).toHaveLength(1);
    expect(res.body.data.po_number).toBe(poRes.rows[0].po_number);
  });

  test('failed approve-admin leaves request dept_approved and creates NO PO (transactional rollback)', async () => {
    // approve-admin is only valid on dept_approved — calling it on a pending
    // request must fail atomically: no status change, no PO leaked.
    const body = validPrBody(world.mainWhA, world.itemId, world.itemId2, world.unitCode);
    const created = await apiCreatePr(app, world.users.wmA.token, body);
    const pr = created.body.data;

    const res = await apiPatchPr(app, world.users.admin.token, `/${pr.id}/approve-admin`);
    expect(res.status).toBe(409);

    const after = await pool.query('SELECT status, purchase_order_id FROM purchase_requests WHERE id = $1', [pr.id]);
    expect(after.rows[0].status).toBe('pending');
    expect(after.rows[0].purchase_order_id).toBeNull();

    const pos = await pool.query(
      `SELECT count(*)::int AS n FROM purchase_orders po
        JOIN purchase_requests pr ON pr.purchase_order_id = po.id
       WHERE pr.id = $1`,
      [pr.id]
    );
    expect(pos.rows[0].n).toBe(0);
  });
});