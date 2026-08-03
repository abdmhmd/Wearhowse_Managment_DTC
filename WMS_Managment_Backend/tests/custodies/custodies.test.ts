import { pool } from '../../src/config/database';
import { materialRequestsService } from '../../src/modules/material-requests/material-requests.service';
import { custodiesService } from '../../src/modules/custodies/custodies.service';
import { projectsService } from '../../src/modules/projects/projects.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedDepartment, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}cust_`;

let catCode: string;
let unitCode: string;
let whId: number;
let deptId: number;
let requesterId: number;
let approverId: number;
let consumableId: number;
let durableId: number;
let projectId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  deptId = await seedDepartment();
  requesterId = await seedUser();
  approverId = await seedUser();
  consumableId = await seedItem(catCode, unitCode, whId, 500, { is_consumable: true });
  durableId = await seedItem(catCode, unitCode, whId, 500, { is_consumable: false });
  const supervisorId = await seedUser();
  projectId = (await projectsService.create(approverId, {
    name: `${prefix}Project`,
    department_id: deptId,
    supervisor_id: supervisorId,
  })).id;
});
afterAll(async () => { await cleanup(prefix); });

async function issueFlow(items: Array<{ item_id: number; quantity: number; unit_code: string }>, opts: { request_type?: 'experiment' | 'semester' | 'project'; project_id?: number | null } = {}) {
  const created = await materialRequestsService.createRequest(requesterId, {
    department_id: deptId,
    warehouse_id: whId,
    request_type: opts.request_type ?? 'experiment',
    project_id: opts.project_id ?? null,
    items,
  });
  await materialRequestsService.approveRequest(created.id, approverId);
  return materialRequestsService.issueRequest(created.id, approverId);
}

describe('custody creation on issue', () => {
  test('consumable item issue does NOT create a custody', async () => {
    await issueFlow([{ item_id: consumableId, quantity: 3, unit_code: unitCode }]);

    const res = await pool.query(
      'SELECT * FROM custodies WHERE item_id = $1',
      [consumableId]
    );
    expect(res.rows).toHaveLength(0);
  });

  test('durable item issue creates an active custody', async () => {
    await issueFlow(
      [{ item_id: durableId, quantity: 2, unit_code: unitCode }],
      { request_type: 'project', project_id: projectId }
    );

    const res = await pool.query(
      'SELECT * FROM custodies WHERE item_id = $1 ORDER BY id DESC LIMIT 1',
      [durableId]
    );
    expect(res.rows).toHaveLength(1);
    const custody = res.rows[0];
    expect(custody.status).toBe('active');
    expect(custody.assigned_to).toBe(requesterId);
    expect(custody.project_id).toBe(projectId);
    expect(custody.request_id).not.toBeNull();
    expect(custody.issued_transaction_id).not.toBeNull();
  });

  test('custodiesService.getAll lists the durable custody', async () => {
    const { items } = await custodiesService.getAll({ assigned_to: requesterId });
    expect(items.some((c: any) => c.item_id === durableId && c.status === 'active')).toBe(true);
  });
});
