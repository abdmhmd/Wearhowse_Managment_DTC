import { pool } from '../../src/config/database';
import { itemsService } from '../../src/modules/items/items.service';
import { categoriesService } from '../../src/modules/categories/categories.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}item_sub_`;

let catCode: string;
let unitCode: string;
let whId: number;
let subId: number;
let createdId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  const sub = await categoriesService.createSubcategory(catCode, {
    code: `${prefix}sub_${shortId()}`,
    name_ar: 'Subcategory X',
    name_en: 'Subcategory X EN',
  });
  subId = sub.id;
});
afterAll(async () => { await cleanup(prefix); });

describe('item subcategory', () => {
  test('create persists subcategory_id', async () => {
    const itemCode = `${prefix}${shortId()}`;
    const result = await itemsService.createItem({
      item_code: itemCode,
      name_ar: 'Item With Sub',
      category_code: catCode,
      subcategory_id: subId,
      unit_code: unitCode,
      warehouse_id: whId,
    });
    expect(result.subcategory_id).toBe(subId);
    createdId = result.id;
  });

  test('getItemById returns subcategory name fields', async () => {
    const item = await pool.query('SELECT * FROM items WHERE id = $1', [createdId]);
    expect(item.rows[0].subcategory_id).toBe(subId);
  });

  test('findAll includes subcategory join data', async () => {
    const { items } = await itemsService.getAll(1, 100, { category_code: catCode });
    const target = items.find((i: any) => i.id === createdId);
    expect(target?.subcategory_id).toBe(subId);
    expect(target?.subcategory_name_ar).toBe('Subcategory X');
  });

  test('update can clear subcategory_id (null)', async () => {
    const result = await itemsService.updateItem(createdId, { subcategory_id: null });
    expect(result?.subcategory_id).toBeNull();
  });

  test('update reassigns a subcategory from the same category', async () => {
    const result = await itemsService.updateItem(createdId, { subcategory_id: subId });
    expect(result?.subcategory_id).toBe(subId);
  });

  test('rejects a subcategory from a different category', async () => {
    const otherCat = await seedCategory();
    const foreignSub = await categoriesService.createSubcategory(otherCat, {
      code: `${prefix}foreign_${shortId()}`,
      name_ar: 'Foreign',
    });
    await expect(
      itemsService.updateItem(createdId, { subcategory_id: foreignSub.id })
    ).rejects.toThrow(/does not belong to category/);
  });

  test('rejects a non-existent subcategory', async () => {
    await expect(
      itemsService.updateItem(createdId, { subcategory_id: 999999999 })
    ).rejects.toThrow(/not found/);
  });
});
