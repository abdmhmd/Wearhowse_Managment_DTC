import { pool } from '../../src/config/database';
import { categoriesService } from '../../src/modules/categories/categories.service';
import { shortId, TEST_PREFIX, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}cat_test_`;

beforeAll(async () => {});
afterAll(async () => { await cleanup(prefix); });

describe('categories CRUD', () => {
  let createdCode: string;

  test('create', async () => {
    const code = `${prefix}${shortId()}`;
    const result = await categoriesService.createCategory({ code, name_ar: 'Test Category' });
    expect(result).toMatchObject({ code, name_ar: 'Test Category' });
    createdCode = result.code;
  });

  test('getAll', async () => {
    const { items } = await categoriesService.getAllCategories(1, 100);
    expect(items).toBeDefined();
    expect(Array.isArray(items)).toBe(true);
  });

  test('getByCode', async () => {
    const result = await categoriesService.getCategoryByCode(createdCode);
    expect(result).not.toBeNull();
    expect(result?.code).toBe(createdCode);
  });

  test('update', async () => {
    const result = await categoriesService.updateCategory(createdCode, { name_ar: 'Updated Category' });
    expect(result).not.toBeNull();
    expect(result?.name_ar).toBe('Updated Category');
  });

  test('delete', async () => {
    const result = await categoriesService.deleteCategory(createdCode);
    expect(result).not.toBeNull();
    expect(result?.code).toBe(createdCode);
    const check = await categoriesService.getCategoryByCode(createdCode);
    expect(check).toBeNull();
  });
});