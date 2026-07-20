import { pool } from '../../src/config/database';
import { warehousesService } from '../../src/modules/warehouses/warehouses.service';
import { shortId, TEST_PREFIX, cleanup } from '../helpers';

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