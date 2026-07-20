import { pool } from '../../src/config/database';
import { unitsService } from '../../src/modules/units/units.service';
import { shortId, TEST_PREFIX, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}unit_test_`;

afterAll(async () => { await cleanup(prefix); });

describe('units CRUD', () => {
  let createdCode: string;

  test('create', async () => {
    const code = `${prefix}${shortId()}`;
    const result = await unitsService.create({ code, name_ar: 'Test Unit', name_en: 'Test Unit EN' });
    expect(result).toMatchObject({ code, name_ar: 'Test Unit', name_en: 'Test Unit EN' });
    createdCode = result.code;
  });

  test('getAll', async () => {
    const { items } = await unitsService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('getByCode', async () => {
    const result = await unitsService.getByCode(createdCode);
    expect(result).not.toBeNull();
    expect(result?.code).toBe(createdCode);
  });

  test('update', async () => {
    const result = await unitsService.update(createdCode, { name_ar: 'Updated Unit' });
    expect(result).not.toBeNull();
    expect(result?.name_ar).toBe('Updated Unit');
  });

  test('delete', async () => {
    const result = await unitsService.delete(createdCode);
    expect(result).not.toBeNull();
    const check = await unitsService.getByCode(createdCode);
    expect(check).toBeNull();
  });
});