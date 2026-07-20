import { pool } from '../../src/config/database';
import { suppliersService } from '../../src/modules/suppliers/suppliers.service';
import { shortId, TEST_PREFIX, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}supp_test_`;

afterAll(async () => { await cleanup(prefix); });

describe('suppliers CRUD', () => {
  let createdId: number;

  test('create', async () => {
    const name = `${prefix}${shortId()}`;
    const result = await suppliersService.create({ name_ar: name, phone: '123456' });
    expect(result).toMatchObject({ name_ar: name, phone: '123456' });
    expect(result.id).toBeGreaterThan(0);
    createdId = result.id;
  });

  test('getAll', async () => {
    const { items } = await suppliersService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('getById', async () => {
    const result = await suppliersService.getById(createdId);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(createdId);
  });

  test('update', async () => {
    const result = await suppliersService.update(createdId, { name_ar: 'Updated Supplier' });
    expect(result).not.toBeNull();
    expect(result?.name_ar).toBe('Updated Supplier');
  });

  test('delete', async () => {
    const result = await suppliersService.delete(createdId);
    expect(result).not.toBeNull();
    const check = await suppliersService.getById(createdId);
    expect(check).toBeNull();
  });
});