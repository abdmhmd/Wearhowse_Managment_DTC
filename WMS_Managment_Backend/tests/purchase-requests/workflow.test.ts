import { pool } from '../../src/config/database';
import { PR_TEST_PREFIX, seedPrWorld, login, apiCreatePr, apiPatchPr, prTeardown, validPrBody, type PrWorld } from './helpers';

describe('Purchase requests — 3-stage workflow', () => {
  let app: any;
  let world: PrWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPrWorld();
    for (const u of Object.values(world.users)) u.token = await login(app, u);
  });

  afterAll(async () => { await prTeardown(PR_TEST_PREFIX); });

  async function createPr(): Promise<any> {
    const body = validPrBody(world.mainWhA, world.itemId, world.itemId2, world.unitCode);
    const res = await apiCreatePr(app, world.users.wmA.token, body);
    expect(res.status).toBe(201);
    return res.body.data;
  }

  test('pending -> dept_approved -> admin_approved (+auto-PO link)', async () => {
    const pr = await createPr();

    // dept approval
    const dept = await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);
    expect(dept.status).toBe(200);
    expect(dept.body.data.status).toBe('dept_approved');
    expect(dept.body.data.dept_approved_by).toBe(world.users.deptMgrA.id);
    expect(dept.body.data.dept_approved_at).not.toBeNull();

    // admin approval
    const adm = await apiPatchPr(app, world.users.admin.token, `/${pr.id}/approve-admin`);
    expect(adm.status).toBe(200);
    expect(adm.body.data.status).toBe('admin_approved');
    expect(adm.body.data.admin_approved_by).toBe(world.users.admin.id);
    expect(adm.body.data.admin_approved_at).not.toBeNull();
    expect(adm.body.data.purchase_order_id).not.toBeNull();
    expect(adm.body.data.po_number).toMatch(/^PO-\d{4}-\d{6}$/);
  });

  test('approve-dept twice -> 409', async () => {
    const pr = await createPr();
    const first = await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);
    expect(first.status).toBe(200);
    const second = await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);
    expect(second.status).toBe(409);
  });

  test('approve-admin on a PENDING request -> 409', async () => {
    const pr = await createPr();
    const res = await apiPatchPr(app, world.users.admin.token, `/${pr.id}/approve-admin`);
    expect(res.status).toBe(409);
  });

  test('approve-admin twice -> 409 and only ONE auto-PO exists', async () => {
    const pr = await createPr();
    await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);

    const first = await apiPatchPr(app, world.users.admin.token, `/${pr.id}/approve-admin`);
    expect(first.status).toBe(200);
    const second = await apiPatchPr(app, world.users.admin.token, `/${pr.id}/approve-admin`);
    expect(second.status).toBe(409);

    const pos = await pool.query(
      `SELECT count(*)::int AS n FROM purchase_orders po
        JOIN purchase_requests pr ON pr.purchase_order_id = po.id
       WHERE pr.id = $1`,
      [pr.id]
    );
    expect(pos.rows[0].n).toBe(1);
  });

  test('reject-dept on a pending request -> rejected with reason (terminal)', async () => {
    const pr = await createPr();
    const res = await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/reject-dept`, { reason: 'Budget unavailable' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.rejection_reason).toBe('Budget unavailable');
    expect(res.body.data.rejected_by).toBe(world.users.deptMgrA.id);

    // terminal: nothing can move it forward again
    const again = await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);
    expect(again.status).toBe(409);
  });

  test('reject-dept on a dept_approved request -> rejected', async () => {
    const pr = await createPr();
    await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);
    const res = await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/reject-dept`, { reason: 'Over budget' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
  });

  test('reject-admin on a dept_approved request -> rejected', async () => {
    const pr = await createPr();
    await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);
    const res = await apiPatchPr(app, world.users.admin.token, `/${pr.id}/reject-admin`, { reason: 'Not in plan' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.rejected_by).toBe(world.users.admin.id);
  });

  test('cancel a pending request by its creator -> cancelled', async () => {
    const pr = await createPr();
    const res = await apiPatchPr(app, world.users.wmA.token, `/${pr.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelled_by).toBe(world.users.wmA.id);
  });

  test('cancel after dept approval -> 409', async () => {
    const pr = await createPr();
    await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);
    const res = await apiPatchPr(app, world.users.wmA.token, `/${pr.id}/cancel`);
    expect(res.status).toBe(409);
  });

  test('another user cannot cancel someone else request (creator-only)', async () => {
    const pr = await createPr();
    // wmA created it; wmB is a different sub-warehouse manager
    const res = await apiPatchPr(app, world.users.wmB.token, `/${pr.id}/cancel`);
    expect(res.status).toBe(404);
  });

  test('reject already-cancelled request -> 409', async () => {
    const pr = await createPr();
    await apiPatchPr(app, world.users.wmA.token, `/${pr.id}/cancel`);
    const res = await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/reject-dept`, { reason: 'late' });
    expect(res.status).toBe(409);
  });
});