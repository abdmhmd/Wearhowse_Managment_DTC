import request from 'supertest';
import { pool } from '../../src/config/database';
import { hashPassword } from '../../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}multiwh_`;
let app: any;

interface SeedRoleUser {
  id: number;
  username: string;
  password: string;
  token: string;
}

async function seedRoleUser(role: string, opts: { department_id?: number | null; warehouse_ids?: number[] } = {}): Promise<SeedRoleUser> {
  const password = 'testPass123';
  const password_hash = await hashPassword(password);
  const username = `${prefix}${role}_${shortId()}`;
  const userRes = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, department_id, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [username, password_hash, username, role, opts.department_id ?? null]
  );
  const id = userRes.rows[0].id;
  for (const wh of opts.warehouse_ids ?? []) {
    await pool.query(
      'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, wh]
    );
  }
  return { id, username, password, token: '' };
}

async function login(user: SeedRoleUser): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password });
  return res.body.data.token;
}

describe('Material Requests — Enterprise Multi-Warehouse Targeting', () => {
  let deptA: number;
  let deptB: number;
  let mainWhA: number;
  let mainWhB: number;
  let subWhA1: number;
  let subWhA2: number;
  let subWhB: number;
  let catCode: string;
  let unitCode: string;
  let itemId: number;

  let wmMulti: SeedRoleUser;
  let wmSingle: SeedRoleUser;
  let admin: SeedRoleUser;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;

    deptA = await seedDepartment();
    deptB = await seedDepartment();

    mainWhA = await seedWarehouse({ is_main: true, department_id: deptA });
    mainWhB = await seedWarehouse({ is_main: true, department_id: deptB });

    subWhA1 = await seedWarehouse({ is_main: false, department_id: deptA });
    subWhA2 = await seedWarehouse({ is_main: false, department_id: deptA });
    subWhB = await seedWarehouse({ is_main: false, department_id: deptB });

    catCode = await seedCategory();
    unitCode = await seedUnit();
    itemId = await seedItem(catCode, unitCode, mainWhA);

    wmMulti = await seedRoleUser('sub_warehouse_manager', {
      department_id: deptA,
      warehouse_ids: [subWhA1, subWhA2],
    });
    wmSingle = await seedRoleUser('sub_warehouse_manager', {
      department_id: deptA,
      warehouse_ids: [subWhA1],
    });
    admin = await seedRoleUser('admin', {});

    wmMulti.token = await login(wmMulti);
    wmSingle.token = await login(wmSingle);
    admin.token = await login(admin);
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  const lines = () => [{ item_id: itemId, quantity: 5, unit_code: unitCode }];

  test('Multi-assigned manager can explicitly select first assigned warehouse', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${wmMulti.token}`)
      .send({
        warehouse_id: subWhA1,
        items: lines(),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(subWhA1);
    expect(res.body.data.department_id).toBe(deptA);
  });

  test('Multi-assigned manager can explicitly select second assigned warehouse', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${wmMulti.token}`)
      .send({
        warehouse_id: subWhA2,
        items: lines(),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(subWhA2);
    expect(res.body.data.department_id).toBe(deptA);
  });

  test('Multi-assigned manager defaults to first warehouse if omitted', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${wmMulti.token}`)
      .send({
        items: lines(),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.warehouse_id).toBe(subWhA1);
  });

  test('Multi-assigned manager cannot target an unassigned warehouse (even if in same dept)', async () => {
    const unassignedWh = await seedWarehouse({ is_main: false, department_id: deptA });
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${wmMulti.token}`)
      .send({
        warehouse_id: unassignedWh,
        items: lines(),
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not in your assigned eligible warehouses');
  });

  test('Single-assigned manager cannot target foreign warehouse', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${wmSingle.token}`)
      .send({
        warehouse_id: subWhB,
        items: lines(),
      });
    expect(res.status).toBe(400);
  });
});
