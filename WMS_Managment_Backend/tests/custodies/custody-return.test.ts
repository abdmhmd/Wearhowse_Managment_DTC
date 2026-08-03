import { pool } from '../../src/config/database';
import { materialRequestsService } from '../../src/modules/material-requests/material-requests.service';
import { custodiesService } from '../../src/modules/custodies/custodies.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedDepartment, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}custret_`;

let catCode: string;
let unitCode: string;
let whId: number;
let deptId: number;
let requesterId: number;
let approverId: number;
let durableId: number;
let custodyId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  deptId = await seedDepartment();
  requesterId = await seedUser();
  approverId = await seedUser();
  durableId = await seedItem(catCode, unitCode, whId, 500, { is_consumable: false });

  const created = await materialRequestsService.createRequest(requesterId, {
    department_id: deptId,
    warehouse_id: whId,
    items: [{ item_id: durableId, quantity: 2, unit_code: unitCode }],
  });
  await materialRequestsService.approveRequest(created.id, approverId);
  await materialRequestsService.issueRequest(created.id, approverId);

  const res = await pool.query(
    'SELECT * FROM custodies WHERE item_id = $1 ORDER BY id DESC LIMIT 1',
    [durableId]
  );
  custodyId = res.rows[0].id;
});
afterAll(async () => { await cleanup(prefix); });

describe('custody return', () => {
  test('returnItem creates and approves an RTI transaction', async () => {
    const result = await custodiesService.returnItem(custodyId, approverId, 'Experiment finished');

    expect(result.transaction_id).toBeDefined();

    const tx = await pool.query(
      'SELECT * FROM transactions WHERE id = $1',
      [result.transaction_id]
    );
    expect(tx.rows[0].type).toBe('RTI');
    expect(tx.rows[0].status).toBe('approved');
  });

  test('custody is marked returned with linked return transaction', async () => {
    const custody = await custodiesService.getById(custodyId);
    expect(custody.status).toBe('returned');
    expect(custody.return_transaction_id).not.toBeNull();
    expect(custody.returned_at).not.toBeNull();
  });

  test('returning twice throws a validation error', async () => {
    await expect(custodiesService.returnItem(custodyId, approverId)).rejects.toThrow();
  });
});
