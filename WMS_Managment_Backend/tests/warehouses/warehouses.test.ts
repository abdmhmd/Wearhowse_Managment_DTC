import { pool } from '../../src/config/database';
import { warehousesService } from '../../src/modules/warehouses/warehouses.service';
import { shortId, TEST_PREFIX, seedDepartment, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}wh_test_`;

afterAll(async () => { await cleanup(prefix); });

describe('warehouses CRUD', () => {
  let createdId: number;

  test('create', async () => {
    const code = `${prefix}${shortId()}`;
    const result = await warehousesService.create({ code, name_ar: 'Test Warehouse', location: 'Loc1' });
    expect(result).toMatchObject({ code, name_ar: 'Test Warehouse', location: 'Loc1' });
    expect(result.id).toBeGreaterThan(0);
    createdId = result.id;
  });

  test('getAll', async () => {
    const { items } = await warehousesService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('getById', async () => {
    const result = await warehousesService.getById(createdId);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(createdId);
  });

  test('update', async () => {
    const result = await warehousesService.update(createdId, { name_ar: 'Updated WH' });
    expect(result).not.toBeNull();
    expect(result?.name_ar).toBe('Updated WH');
  });

  test('delete', async () => {
    const result = await warehousesService.delete(createdId);
    expect(result).not.toBeNull();
    const check = await warehousesService.getById(createdId);
    expect(check).toBeNull();
  });
});

describe('warehouses one-main-per-department', () => {
  test('rejects a second main warehouse for the same department', async () => {
    const deptId = await seedDepartment();
    const mainId = await warehousesService.create({
      code: `${prefix}${shortId()}`,
      name_ar: 'Main WH',
      is_main: true,
      department_id: deptId,
    });
    expect(mainId.id).toBeGreaterThan(0);

    await expect(
      warehousesService.create({
        code: `${prefix}${shortId()}`,
        name_ar: 'Second Main WH',
        is_main: true,
        department_id: deptId,
      })
    ).rejects.toThrow(/already exists for this department/);
  });

  test('allows a main warehouse for a different department', async () => {
    const deptA = await seedDepartment();
    const deptB = await seedDepartment();
    await warehousesService.create({
      code: `${prefix}${shortId()}`,
      name_ar: 'Dept A Main',
      is_main: true,
      department_id: deptA,
    });
    const b = await warehousesService.create({
      code: `${prefix}${shortId()}`,
      name_ar: 'Dept B Main',
      is_main: true,
      department_id: deptB,
    });
    expect(b.id).toBeGreaterThan(0);
  });

  test('rejects setting is_main=true on update when a main already exists', async () => {
    const deptId = await seedDepartment();
    const existing = await warehousesService.create({
      code: `${prefix}${shortId()}`,
      name_ar: 'Existing Main',
      is_main: true,
      department_id: deptId,
    });
    const regular = await warehousesService.create({
      code: `${prefix}${shortId()}`,
      name_ar: 'Regular WH',
      department_id: deptId,
    });

    await expect(
      warehousesService.update(regular.id, { is_main: true })
    ).rejects.toThrow(/already exists for this department/);
    expect(existing.id).toBeGreaterThan(0);
  });

  test('allows the existing main to be updated', async () => {
    const deptId = await seedDepartment();
    const main = await warehousesService.create({
      code: `${prefix}${shortId()}`,
      name_ar: 'Main WH',
      is_main: true,
      department_id: deptId,
    });
    const updated = await warehousesService.update(main.id, { name_ar: 'Main WH Updated' });
    expect(updated?.name_ar).toBe('Main WH Updated');
  });
});