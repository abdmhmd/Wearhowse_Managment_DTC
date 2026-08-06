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

describe('categories hierarchy (parent_code)', () => {
  let parentCode: string;
  let childCode: string;

  test('create a parent category', async () => {
    parentCode = `${prefix}parent_${shortId()}`;
    await categoriesService.createCategory({ code: parentCode, name_ar: 'Parent' });
  });

  test('create a child category referencing parent_code', async () => {
    childCode = `${prefix}child_${shortId()}`;
    const result = await categoriesService.createCategory({ code: childCode, name_ar: 'Child', parent_code: parentCode });
    expect(result.parent_code).toBe(parentCode);
  });

  test('rejects parent_code that does not exist', async () => {
    await expect(
      categoriesService.createCategory({ code: `${prefix}x_${shortId()}`, name_ar: 'X', parent_code: 'NOPE' })
    ).rejects.toThrow();
  });

  test('rejects self-parenting', async () => {
    await expect(
      categoriesService.updateCategory(parentCode, { parent_code: parentCode })
    ).rejects.toThrow();
  });

  test('rejects moving a category under its own descendant', async () => {
    await expect(
      categoriesService.updateCategory(parentCode, { parent_code: childCode })
    ).rejects.toThrow();
  });

  test('allows moving a child to a sibling branch (no cycle)', async () => {
    const result = await categoriesService.updateCategory(childCode, { parent_code: null });
    expect(result.parent_code).toBeNull();
  });
});

describe('subcategories', () => {
  let catCode: string;
  let subId: number;

  test('create', async () => {
    catCode = `${prefix}subcat_root_${shortId()}`;
    await categoriesService.createCategory({ code: catCode, name_ar: 'Root' });
    const result = await categoriesService.createSubcategory(catCode, {
      code: `${prefix}sub_${shortId()}`,
      name_ar: 'Sub A',
      name_en: 'Sub A EN',
    });
    expect(result).toMatchObject({ category_code: catCode, name_ar: 'Sub A', name_en: 'Sub A EN' });
    subId = result.id;
  });

  test('getSubcategories returns the created subcategory', async () => {
    const items = await categoriesService.getSubcategories(catCode);
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((s: any) => s.id === subId)).toBe(true);
  });

  test('create rejects duplicate code under the same category', async () => {
    const dup = await categoriesService.getSubcategories(catCode);
    const existingCode = dup.find((s: any) => s.id === subId).code;
    await expect(
      categoriesService.createSubcategory(catCode, { code: existingCode, name_ar: 'Dup' })
    ).rejects.toThrow(/already exists/);
  });

  test('getSubcategories throws when category not found', async () => {
    await expect(categoriesService.getSubcategories('NO_SUCH_CATEGORY')).rejects.toThrow(/not found/);
  });

  test('update', async () => {
    const result = await categoriesService.updateSubcategory(subId, { name_ar: 'Sub A Updated' });
    expect(result?.name_ar).toBe('Sub A Updated');
    expect(result?.is_active).toBe(true);
  });

  test('delete soft-deletes', async () => {
    const result = await categoriesService.deleteSubcategory(subId);
    expect(result?.is_active).toBe(false);
  });

  test('delete throws when subcategory not found', async () => {
    await expect(categoriesService.deleteSubcategory(999999999)).rejects.toThrow(/not found/);
  });
});
