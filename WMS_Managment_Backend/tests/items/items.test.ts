import { pool } from '../../src/config/database';
import { itemsService } from '../../src/modules/items/items.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedDepartment, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}item_test_`;
let catCode: string;
let unitCode: string;
let whId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
});
afterAll(async () => { await cleanup(prefix); });

describe('items CRUD', () => {
  let createdId: number;

  test('create', async () => {
    const itemCode = `${prefix}${shortId()}`;
    const result = await itemsService.createItem({
      item_code: itemCode,
      name_ar: 'Test Item',
      category_code: catCode,
      unit_code: unitCode,
      warehouse_id: whId,
      current_balance: 100,
    });
    expect(result).toMatchObject({ item_code: itemCode, name_ar: 'Test Item', current_balance: '100.0000' });
    expect(result.id).toBeGreaterThan(0);
    createdId = result.id;
  });

  test('getAll', async () => {
    const { items } = await itemsService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('getItemCard', async () => {
    const result = await itemsService.getItemCard(createdId);
    expect(result.item).toBeDefined();
    expect(result.item.id).toBe(createdId);
    expect(result.recent_movements).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  test('update', async () => {
    const result = await itemsService.updateItem(createdId, { name_ar: 'Updated Item', current_balance: 200 });
    expect(result).not.toBeNull();
    expect(result?.name_ar).toBe('Updated Item');
  });

  test('delete', async () => {
    const result = await itemsService.deleteItem(createdId);
    expect(result).not.toBeNull();
    expect(result?.is_active).toBe(false);
  });
});

describe('items department filter (picker cascading)', () => {
  test('filters items by the department of their primary warehouse', async () => {
    const deptId = await seedDepartment();
    const otherDeptId = await seedDepartment();
    const whInDept = await seedWarehouse({ department_id: deptId });
    const whOtherDept = await seedWarehouse({ department_id: otherDeptId });

    const itemCode = `${prefix}${shortId()}`;
    const res = await pool.query(
      `INSERT INTO items (item_code, name_ar, category_code, unit_code, warehouse_id, current_balance)
       VALUES ($1, $2, $3, $4, $5, 10) RETURNING id`,
      [itemCode, 'Dept Item', catCode, unitCode, whInDept]
    );
    const itemId = res.rows[0].id;

    const inDept = await itemsService.getAll(1, 100, { department_id: deptId });
    expect(inDept.items.some((i: any) => i.id === itemId)).toBe(true);
    expect((inDept.items as any[]).every((i) => i.id !== itemId || i.warehouse_id === whInDept)).toBe(true);

    const other = await itemsService.getAll(1, 100, { department_id: otherDeptId });
    expect(other.items.some((i: any) => i.id === itemId)).toBe(false);
  });
});