import { pool } from '../../src/config/database';
import { unitConversionsService } from '../../src/modules/unit-conversions/unit-conversions.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedItem, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}uc_test_`;
let catCode: string;
let unitA: string;
let unitB: string;
let whId: number;
let itemId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitA = await seedUnit();
  unitB = await seedUnit();
  whId = await seedWarehouse();
  itemId = await seedItem(catCode, unitA, whId);
});
afterAll(async () => { await cleanup(prefix); });

describe('unit-conversions CRUD', () => {
  let createdId: number;

  test('create', async () => {
    const result = await unitConversionsService.create({
      item_id: itemId,
      from_unit_code: unitA,
      to_unit_code: unitB,
      factor: 2.5,
    });
    expect(result).toMatchObject({ item_id: itemId, from_unit_code: unitA, to_unit_code: unitB, factor: '2.5' });
    expect(result.id).toBeGreaterThan(0);
    createdId = result.id;
  });

  test('getAll', async () => {
    const { items } = await unitConversionsService.getAll(1, 100);
    expect(Array.isArray(items)).toBe(true);
  });

  test('getByItemId', async () => {
    const result = await unitConversionsService.getByItemId(itemId);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test('update', async () => {
    const result = await unitConversionsService.update(createdId, { factor: 3.0 });
    expect(result).not.toBeNull();
    expect(parseFloat(result?.factor)).toBe(3.0);
  });

  test('delete', async () => {
    const result = await unitConversionsService.delete(createdId);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(createdId);
    const check = await pool.query('SELECT * FROM unit_conversions WHERE id = $1', [createdId]);
    expect(check.rows).toHaveLength(0);
  });
});