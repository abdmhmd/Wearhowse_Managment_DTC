import { pool } from '../../src/config/database';
import { createMaterialRequestSchema } from '../../src/modules/material-requests/material-requests.validator';
import { materialRequestsService } from '../../src/modules/material-requests/material-requests.service';
import { projectsService } from '../../src/modules/projects/projects.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedDepartment, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}projreq_`;

let catCode: string;
let unitCode: string;
let whId: number;
let requesterId: number;
let deptId: number;
let itemId: number;
let projectId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  deptId = await seedDepartment();
  whId = await seedWarehouse({ department_id: deptId });
  requesterId = await seedUser();
  itemId = await seedItem(catCode, unitCode, whId, 100);
  const supervisorId = await seedUser();
  projectId = await (await projectsService.create(requesterId, {
    name: `${prefix}Project`,
    department_id: deptId,
    supervisor_id: supervisorId,
  })).id;
});
afterAll(async () => { await cleanup(prefix); });

describe('project request validation', () => {
  test('validator rejects project-type request without project_id', () => {
    const parsed = createMaterialRequestSchema.safeParse({
      department_id: deptId,
      warehouse_id: whId,
      request_type: 'project',
      items: [{ item_id: itemId, quantity: 1, unit_code: unitCode }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('project_id'))).toBe(true);
    }
  });

  test('validator accepts project-type request with project_id', () => {
    const parsed = createMaterialRequestSchema.safeParse({
      department_id: deptId,
      warehouse_id: whId,
      request_type: 'project',
      project_id: projectId,
      items: [{ item_id: itemId, quantity: 1, unit_code: unitCode }],
    });
    expect(parsed.success).toBe(true);
  });

  test('service persists request_type and project_id', async () => {
    const created = await materialRequestsService.createRequest(requesterId, {
      department_id: deptId,
      warehouse_id: whId,
      request_type: 'project',
      project_id: projectId,
      priority: 'high',
      items: [{ item_id: itemId, quantity: 2, unit_code: unitCode }],
    });
    expect(created.request_type).toBe('project');
    expect(created.project_id).toBe(projectId);

    const fetched = await materialRequestsService.getById(created.id);
    expect(fetched.project_no).toBeDefined();
    expect(fetched.project_name).toBe(`${prefix}Project`);
  });

  test('project request_count increments', async () => {
    const project = await projectsService.getById(projectId);
    expect(project.request_count).toBeGreaterThanOrEqual(1);
  });
});
