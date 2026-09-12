import { pool } from '../../src/config/database';
import { materialRequestsService } from '../../src/modules/material-requests/material-requests.service';
import { custodiesService } from '../../src/modules/custodies/custodies.service';
import { projectsService } from '../../src/modules/projects/projects.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedDepartment, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}projclose_`;

let catCode: string;
let unitCode: string;
let whId: number;
let deptId: number;
let mainWhId: number;
let requesterId: number;
let approverId: number;
let durableId: number;
let projectId: number;
let custodyId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  deptId = await seedDepartment();
  whId = await seedWarehouse({ department_id: deptId });
  mainWhId = await seedWarehouse({ department_id: deptId, is_main: true });
  requesterId = await seedUser();
  approverId = await seedUser();
  durableId = await seedItem(catCode, unitCode, mainWhId, 500, { is_consumable: false });
  const supervisorId = await seedUser();

  projectId = (await projectsService.create(approverId, {
    name: `${prefix}Project`,
    department_id: deptId,
    supervisor_id: supervisorId,
  })).id;

  const created = await materialRequestsService.createRequest(requesterId, {
    department_id: deptId,
    warehouse_id: whId,
    request_type: 'project',
    project_id: projectId,
    items: [{ item_id: durableId, quantity: 1, unit_code: unitCode }],
  });
  await materialRequestsService.approveRequest(created.id, approverId);
  await materialRequestsService.forwardRequest(created.id, approverId);
  await materialRequestsService.approveRequest(created.id, approverId);
  await materialRequestsService.issueRequest(created.id, approverId);

  const res = await pool.query(
    'SELECT * FROM custodies WHERE project_id = $1 ORDER BY id DESC LIMIT 1',
    [projectId]
  );
  custodyId = res.rows[0].id;
});
afterAll(async () => { await cleanup(prefix); });

describe('project close rules', () => {
  test('close is blocked while the project has an active custody', async () => {
    await expect(projectsService.close(projectId, approverId)).rejects.toThrow(/active or return-pending custody/i);
  });

  test('close succeeds after the custody is returned', async () => {
    await custodiesService.returnItem(custodyId, approverId, 'Project work done');

    const closed = await projectsService.close(projectId, approverId);
    expect(closed.status).toBe('closed');
    expect(closed.closed_by).toBe(approverId);
    expect(closed.closed_at).not.toBeNull();
  });
});
