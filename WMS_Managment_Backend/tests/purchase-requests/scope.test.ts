import request from 'supertest';
import { PR_TEST_PREFIX, seedPrWorld, login, apiCreatePr, apiPatchPr, prTeardown, validPrBody, type PrWorld } from './helpers';

describe('Purchase requests — data scope', () => {
  let app: any;
  let world: PrWorld;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
    world = await seedPrWorld();
    for (const u of Object.values(world.users)) u.token = await login(app, u);
  });

  afterAll(async () => { await prTeardown(PR_TEST_PREFIX); });

  async function createPrAs(user: 'wmA' | 'wmB'): Promise<any> {
    const warehouseId = user === 'wmA' ? world.mainWhA : world.mainWhB;
    const itemA = user === 'wmA' ? world.itemId : world.foreignItemId;
    const itemB = user === 'wmA' ? world.itemId2 : world.foreignItemId2;
    const body = validPrBody(warehouseId, itemA, itemB, world.unitCode);
    const res = await apiCreatePr(app, world.users[user].token, body);
    expect(res.status).toBe(201);
    return res.body.data;
  }

  test('sub_warehouse_manager (view_own) sees ONLY their own requests', async () => {
    const own = await createPrAs('wmA');
    await createPrAs('wmB');

    const res = await request(app)
      .get('/api/purchase-requests')
      .set('Authorization', `Bearer ${world.users.wmA.token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((i: any) => i.id);
    expect(ids).toContain(own.id);
    // wmB's request is created by a different user -> invisible to wmA
    const foreignIds = res.body.data.items.filter((i: any) => i.created_by === world.users.wmB.id);
    expect(foreignIds).toHaveLength(0);
  });

  test('department_manager (view) sees every request of their department but none from the other', async () => {
    await createPrAs('wmA');
    await createPrAs('wmB');

    const res = await request(app)
      .get('/api/purchase-requests')
      .set('Authorization', `Bearer ${world.users.deptMgrA.token}`);

    expect(res.status).toBe(200);
    const departments = res.body.data.items.map((i: any) => i.department_id);
    expect(departments.length).toBeGreaterThan(0);
    expect(departments.every((d: number) => d === world.deptA)).toBe(true);
  });

  test('admin (view, GLOBAL) sees every request across departments', async () => {
    await createPrAs('wmA');
    await createPrAs('wmB');

    const res = await request(app)
      .get('/api/purchase-requests')
      .set('Authorization', `Bearer ${world.users.admin.token}`);

    expect(res.status).toBe(200);
    const departments = new Set(res.body.data.items.map((i: any) => i.department_id));
    expect(departments.has(world.deptA)).toBe(true);
    expect(departments.has(world.deptB)).toBe(true);
  });

  test('out-of-scope detail -> 404 (never leaks existence)', async () => {
    const own = await createPrAs('wmA');

    const res = await request(app)
      .get(`/api/purchase-requests/${own.id}`)
      .set('Authorization', `Bearer ${world.users.wmB.token}`);

    expect(res.status).toBe(404);
  });

  test('in-scope detail returns the full request with items', async () => {
    const own = await createPrAs('wmA');

    const res = await request(app)
      .get(`/api/purchase-requests/${own.id}`)
      .set('Authorization', `Bearer ${world.users.wmA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(own.id);
    expect(res.body.data.items).toHaveLength(2);
  });

  test('dept manager blocked from dept-approving the OTHER department request (404, not 403)', async () => {
    const foreign = await createPrAs('wmB'); // deptB request
    const res = await apiPatchPr(app, world.users.deptMgrA.token, `/${foreign.id}/approve-dept`);
    expect(res.status).toBe(404);
  });

  test('status filter is honored on the list endpoint', async () => {
    const pr = await createPrAs('wmA');
    await apiPatchPr(app, world.users.deptMgrA.token, `/${pr.id}/approve-dept`);

    const res = await request(app)
      .get('/api/purchase-requests?status=dept_approved')
      .set('Authorization', `Bearer ${world.users.deptMgrA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((i: any) => i.status === 'dept_approved')).toBe(true);
  });
});