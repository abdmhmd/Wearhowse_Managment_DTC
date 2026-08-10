import { pool } from '../../src/config/database';
import { materialRequestsService } from '../../src/modules/material-requests/material-requests.service';
import { custodiesService } from '../../src/modules/custodies/custodies.service';
import { TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedDepartment, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}custcond_`;

let catCode: string;
let unitCode: string;
let whId: number;
let deptId: number;
let mainWhId: number;
let requesterId: number;
let approverId: number;
let durableId: number;

async function issueCustody(quantity: number) {
  const created = await materialRequestsService.createRequest(requesterId, {
    department_id: deptId,
    warehouse_id: whId,
    items: [{ item_id: durableId, quantity, unit_code: unitCode }],
  });
  await materialRequestsService.approveRequest(created.id, approverId);
  await materialRequestsService.forwardRequest(created.id, approverId);
  await materialRequestsService.approveRequest(created.id, approverId);
  await materialRequestsService.issueRequest(created.id, approverId);

  const res = await pool.query('SELECT * FROM custodies WHERE request_id = $1', [created.id]);
  return res.rows[0];
}

async function balance(): Promise<number> {
  const res = await pool.query('SELECT current_balance FROM items WHERE id = $1', [durableId]);
  return Number(res.rows[0].current_balance);
}

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  deptId = await seedDepartment();
  whId = await seedWarehouse({ department_id: deptId });
  mainWhId = await seedWarehouse({ department_id: deptId, is_main: true });
  requesterId = await seedUser();
  approverId = await seedUser();
  // Balance is tracked on items.current_balance for this item alone.
  durableId = await seedItem(catCode, unitCode, mainWhId, 500, { is_consumable: false });
});

afterAll(async () => { await cleanup(prefix); });

describe('custody return conditions', () => {
  test('partial good return keeps the custody active with reduced quantity and restores stock', async () => {
    const custody = await issueCustody(3);
    const balBefore = await balance();

    const result = await custodiesService.returnItem(custody.id, approverId, { condition: 'good', returned_quantity: 1 });

    expect(result.transaction_id).toBeDefined();
    const tx = await pool.query('SELECT * FROM transactions WHERE id = $1', [result.transaction_id]);
    expect(tx.rows[0].type).toBe('RTI');
    expect(tx.rows[0].status).toBe('approved');

    const updated = await custodiesService.getById(custody.id);
    expect(updated.status).toBe('active');
    expect(Number(updated.quantity)).toBe(2);
    expect(updated.returned_at).toBeNull();
    expect(Number(await balance())).toBe(balBefore + 1);
  });

  test('returning more than the outstanding quantity throws', async () => {
    const custody = await issueCustody(2);
    await expect(
      custodiesService.returnItem(custody.id, approverId, { returned_quantity: 3 })
    ).rejects.toThrow(/more than/i);
  });

  test('damaged return does not restore stock and preserves the record as damaged', async () => {
    const custody = await issueCustody(2);
    const balBefore = await balance();

    const result = await custodiesService.returnItem(custody.id, approverId, { condition: 'damaged', notes: 'Broken during use' });
    expect(result.status).toBe('damaged');

    const updated = await custodiesService.getById(custody.id);
    expect(updated.status).toBe('damaged');
    expect(updated.condition).toBe('damaged');
    expect(updated.return_transaction_id).toBeNull();
    expect(Number(await balance())).toBe(balBefore);
  });

  test('lost return preserves the record as lost without restoring stock', async () => {
    const custody = await issueCustody(1);
    const balBefore = await balance();

    const result = await custodiesService.returnItem(custody.id, approverId, { condition: 'lost' });
    expect(result.status).toBe('lost');

    const updated = await custodiesService.getById(custody.id);
    expect(updated.status).toBe('lost');
    expect(updated.condition).toBe('lost');
    expect(updated.return_transaction_id).toBeNull();
    expect(Number(await balance())).toBe(balBefore);
  });

  test('invalid return condition throws a validation error', async () => {
    const custody = await issueCustody(1);
    await expect(
      custodiesService.returnItem(custody.id, approverId, { condition: 'broken' as any })
    ).rejects.toThrow(/condition/i);
  });

  test('full good return still works via the legacy string-notes signature', async () => {
    const custody = await issueCustody(1);
    const balBefore = await balance();

    const result = await custodiesService.returnItem(custody.id, approverId, 'Legacy notes call');

    const updated = await custodiesService.getById(custody.id);
    expect(updated.status).toBe('returned');
    expect(Number(updated.quantity)).toBe(1);
    expect(updated.return_transaction_id).not.toBeNull();
    expect(Number(await balance())).toBe(balBefore + 1);
    expect(result.transaction_no).toBeDefined();
  });
});
