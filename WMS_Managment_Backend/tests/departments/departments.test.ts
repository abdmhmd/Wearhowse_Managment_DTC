// import { pool } from '../../src/config/database';
import { departmentsService } from '../../src/modules/departments/departments.service';
import { shortId, TEST_PREFIX, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}dept_test_`;

afterAll(async () => { await cleanup(prefix); });

describe('departments CRUD', () => {
  let createdCode: string;

  test('create', async () => {
    const code = `${prefix}${shortId()}`;
    const result = await departmentsService.create({ code, name_ar: 'Test Department' });
    expect(result).toMatchObject({ code, name_ar: 'Test Department' });
    createdCode = result.code;
  });

  test('getAll', async () => {
    const { items } = await departmentsService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('getByCode', async () => {
    const result = await departmentsService.getByCode(createdCode);
    expect(result).not.toBeNull();
    expect(result?.code).toBe(createdCode);
  });

  test('update', async () => {
    const result = await departmentsService.update(createdCode, { name_ar: 'Updated Dept' });
    expect(result).not.toBeNull();
    expect(result?.name_ar).toBe('Updated Dept');
  });

  test('delete', async () => {
    const result = await departmentsService.delete(createdCode);
    expect(result).not.toBeNull();
    const check = await departmentsService.getByCode(createdCode);
    expect(check).toBeNull();
  });
});