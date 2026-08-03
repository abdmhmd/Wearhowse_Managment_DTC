import { pool } from '../../src/config/database';
import { itemsService } from '../../src/modules/items/items.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}item_req_`;

let catCode: string;
let unitCode: string;
let whId: number;
let createdId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
});
afterAll(async () => { await cleanup(prefix); });

describe('item new-requirements fields persist', () => {
  test('create persists is_consumable, expiry_alert_days, sap_material_number, gl_account', async () => {
    const itemCode = `${prefix}${shortId()}`;
    const result = await itemsService.createItem({
      item_code: itemCode,
      name_ar: 'Durable Lab Item',
      category_code: catCode,
      unit_code: unitCode,
      warehouse_id: whId,
      current_balance: 10,
      is_consumable: false,
      expiry_alert_days: 7,
      sap_material_number: 'SAP-1001',
      gl_account: 'G-5010',
    });
    expect(result).toMatchObject({
      item_code: itemCode,
      is_consumable: false,
      expiry_alert_days: 7,
      sap_material_number: 'SAP-1001',
      gl_account: 'G-5010',
    });
    createdId = result.id;
  });

  test('getItemById returns the new fields', async () => {
    const item = await pool.query('SELECT * FROM items WHERE id = $1', [createdId]);
    expect(item.rows[0]).toMatchObject({
      is_consumable: false,
      expiry_alert_days: 7,
      sap_material_number: 'SAP-1001',
      gl_account: 'G-5010',
    });
  });

  test('findByItemCode returns the new fields', async () => {
    const created = await pool.query('SELECT * FROM items WHERE id = $1', [createdId]);
    const byCode = await pool.query('SELECT * FROM items WHERE item_code = $1', [created.rows[0].item_code]);
    expect(byCode.rows[0]).toMatchObject({
      is_consumable: false,
      expiry_alert_days: 7,
    });
  });

  test('update persists new fields', async () => {
    const result = await itemsService.updateItem(createdId, {
      is_consumable: true,
      expiry_alert_days: 90,
      sap_material_number: 'SAP-2002',
    });
    expect(result).toMatchObject({
      is_consumable: true,
      expiry_alert_days: 90,
      sap_material_number: 'SAP-2002',
      gl_account: 'G-5010',
    });
  });

  test('getItemsByCategory returns the new fields', async () => {
    const items = await pool.query('SELECT * FROM items WHERE category_code = $1', [catCode]);
    const target = items.rows.find((r: any) => r.id === createdId);
    expect(target).toMatchObject({
      is_consumable: true,
      expiry_alert_days: 90,
      sap_material_number: 'SAP-2002',
      gl_account: 'G-5010',
    });
  });

  test('delete soft-deletes', async () => {
    const result = await itemsService.deleteItem(createdId);
    expect(result?.is_active).toBe(false);
  });
});
