import { pool } from '../../src/config/database';
import { materialRequestsService } from '../../src/modules/material-requests/material-requests.service';
import { custodiesService } from '../../src/modules/custodies/custodies.service';
import { projectsService } from '../../src/modules/projects/projects.service';
import { projectsRepository } from '../../src/modules/projects/projects.repository';
import { custodiesRepository } from '../../src/modules/custodies/custodies.repository';
import { PERMISSIONS } from '../../src/modules/authorization/permissions';
import type { AuthUserContext } from '../../src/modules/authorization/authorization.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedDepartment, seedItem, cleanup } from '../helpers';

/**
 * D16: a project must stay open while a custody is mid-return.
 *
 * A supervisor-initiated return moves the custody to `return_pending` (awaiting
 * the sub-warehouse manager's confirmation). Before this fix only `active`
 * custodies blocked closure, so a project could be closed while one of its
 * durable items was physically still out — only confirmed via a pending RTI.
 * Now `return_pending` custodies block closure and appear in the close report.
 */
const prefix = `${TEST_PREFIX}projclose_rp_`;

describe('D16: project closure is blocked while a custody return is pending', () => {
  let catCode: string;
  let unitCode: string;
  let deptId: number;
  let whId: number;
  let mainWhId: number;
  let requesterId: number;
  let wmId: number;
  let supervisorId: number;
  let durableId: number;
  let projectId: number;
  let custodyId: number;

  const supervisorCtx = (): AuthUserContext => ({
    id: supervisorId,
    userId: supervisorId,
    username: `${prefix}sup`,
    full_name: 'Supervisor',
    role: 'supervisor',
    department_id: deptId,
    department_name_ar: null,
    department_name_en: null,
    is_active: true,
    token_version: 1,
    permissions: [PERMISSIONS.CUSTODIES_RETURN],
    warehouses: [],
    warehouse_ids: [],
  });

  const wmCtx = (): AuthUserContext => ({
    id: wmId,
    userId: wmId,
    username: `${prefix}wm`,
    full_name: 'WM',
    role: 'sub_warehouse_manager',
    department_id: deptId,
    department_name_ar: null,
    department_name_en: null,
    is_active: true,
    token_version: 1,
    permissions: [],
    warehouses: [],
    warehouse_ids: [whId],
  });

  beforeAll(async () => {
    catCode = await seedCategory();
    unitCode = await seedUnit();
    deptId = await seedDepartment();
    whId = await seedWarehouse({ department_id: deptId });
    mainWhId = await seedWarehouse({ department_id: deptId, is_main: true });
    requesterId = await seedUser();
    wmId = await seedUser();
    supervisorId = await seedUser();
    // Durable items home at the main warehouse (issue + RTI credit primary stock)
    durableId = await seedItem(catCode, unitCode, mainWhId, 500, { is_consumable: false });

    projectId = (await projectsService.create(wmId, {
      name: `${prefix}Project_${shortId()}`,
      department_id: deptId,
      supervisor_id: supervisorId,
    })).id;

    // Full supervisor → WM request → issue workflow (same shape as
    // custody-return.test.ts / projects-close.test.ts).
    const created = await materialRequestsService.createRequest(supervisorId, {
      department_id: deptId,
      warehouse_id: whId,
      request_type: 'project',
      priority: 'normal',
      project_id: projectId,
      notes: `${prefix}issue`,
      items: [{ item_id: durableId, quantity: 1, unit_code: unitCode }],
    });
    await materialRequestsService.approveRequest(created.id, wmId);
    await materialRequestsService.forwardRequest(created.id, wmId);
    await materialRequestsService.approveRequest(created.id, wmId);
    await materialRequestsService.issueRequest(created.id, wmId);

    const res = await pool.query(
      'SELECT * FROM custodies WHERE project_id = $1 ORDER BY id DESC LIMIT 1',
      [projectId]
    );
    expect(res.rows[0]?.status).toBe('active');
    custodyId = res.rows[0].id;
  });

  afterAll(async () => {
    await cleanup(prefix);
  });

  test('supervisor-initiated return moves the custody to return_pending (D15 route)', async () => {
    const result = await custodiesService.returnItem(custodyId, supervisorId, 'Experiment finished', supervisorCtx());
    expect(result.message).toMatch(/awaiting warehouse manager confirmation/i);

    const cust = await pool.query(
      'SELECT status FROM custodies WHERE id = $1',
      [custodyId]
    );
    expect(cust.rows[0].status).toBe('return_pending');

    expect(await custodiesRepository.countActiveCustodiesByProject(projectId)).toBe(1);
  });

  test('close is blocked while the custody return is pending (D16)', async () => {
    await expect(projectsService.close(projectId, wmId)).rejects.toThrow(/return-pending/i);

    const row = await pool.query('SELECT status FROM projects WHERE id = $1', [projectId]);
    expect(row.rows[0].status).toBe('open');
  });

  test('the close report lists the pending return custody and can_close=false (D16)', async () => {
    const report = await projectsService.getCloseReport(projectId);
    expect(report.summary.can_close).toBe(false);
    expect(report.summary.active_custodies).toBe(1);
    expect(report.pending_return_materials.map((p: any) => p.custody_id)).toContain(custodyId);

    const db = await projectsRepository.getCloseReport(projectId);
    expect(db.pending_return_materials.find((p: any) => p.custody_id === custodyId).status).toBe('return_pending');
  });

  test('close succeeds after the sub-warehouse manager confirms the return', async () => {
    await custodiesService.receiveReturn(custodyId, wmId, 'good', wmCtx());

    expect(await custodiesRepository.countActiveCustodiesByProject(projectId)).toBe(0);

    const closed = await projectsService.close(projectId, wmId);
    expect(closed.status).toBe('closed');
  });
});