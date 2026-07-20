import { pool } from '../../src/config/database';
import { inventoryReportService } from '../../src/modules/reports/inventoryReport.service';
import { itemsService } from '../../src/modules/items/items.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, cleanup } from '../helpers';

const prefix = `${TEST_PREFIX}report_test_`;
let catCode: string;
let unitCode: string;
let whId: number;
let itemId1: number;
let itemId2: number;
let itemId3: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  const itemCode1 = `${prefix}${shortId()}`;
  const r1 = await pool.query(
    `INSERT INTO items (item_code, name_ar, category_code, unit_code, warehouse_id, current_balance, min_stock_level, max_stock_level)
     VALUES ($1, $2, $3, $4, $5, 100, 10, 200) RETURNING id`,
    [itemCode1, 'Test Item A', catCode, unitCode, whId]
  );
  itemId1 = r1.rows[0].id;
  const itemCode2 = `${prefix}${shortId()}`;
  const r2 = await pool.query(
    `INSERT INTO items (item_code, name_ar, category_code, unit_code, warehouse_id, current_balance, min_stock_level, max_stock_level)
     VALUES ($1, $2, $3, $4, $5, 5, 10, 200) RETURNING id`,
    [itemCode2, 'Test Item B', catCode, unitCode, whId]
  );
  itemId2 = r2.rows[0].id;
  const itemCode3 = `${prefix}${shortId()}`;
  const r3 = await pool.query(
    `INSERT INTO items (item_code, name_ar, category_code, unit_code, warehouse_id, current_balance, min_stock_level, max_stock_level)
     VALUES ($1, $2, $3, $4, $5, 300, 10, 200) RETURNING id`,
    [itemCode3, 'Test Item C', catCode, unitCode, whId]
  );
  itemId3 = r3.rows[0].id;
});

afterAll(async () => { await cleanup(prefix); });

describe('Inventory Report', () => {
  test('getInventoryReport returns paginated items', async () => {
    const result = await inventoryReportService.getInventoryReport({ page: 1, limit: 10 });
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.pagination).toBeDefined();
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.total).toBeGreaterThanOrEqual(3);
  });

  test('getInventoryReport filters by warehouse_id', async () => {
    const result = await inventoryReportService.getInventoryReport({ warehouse_id: whId, page: 1, limit: 100 });
    expect(result.items.length).toBeGreaterThanOrEqual(3);
    result.items.forEach((i: any) => {
      expect(i.warehouse_id).toBe(whId);
    });
  });

  test('getInventoryReport filters low_stock items', async () => {
    const result = await inventoryReportService.getInventoryReport({ low_stock: true, page: 1, limit: 100 });
    result.items.forEach((i: any) => {
      expect(parseFloat(i.current_balance)).toBeLessThanOrEqual(parseFloat(i.min_stock_level));
    });
  });

  test('getInventoryReport filters overstock items', async () => {
    const result = await inventoryReportService.getInventoryReport({ overstock: true, page: 1, limit: 100 });
    result.items.forEach((i: any) => {
      expect(parseFloat(i.current_balance)).toBeGreaterThanOrEqual(parseFloat(i.max_stock_level));
    });
  });

  test('getInventoryReport filters by category_code', async () => {
    const result = await inventoryReportService.getInventoryReport({ category_code: catCode, page: 1, limit: 100 });
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    result.items.forEach((i: any) => {
      expect(i.category_code).toBe(catCode);
    });
  });

  test('getInventoryReport filters by search term', async () => {
    const result = await inventoryReportService.getInventoryReport({ search: 'Test Item A', page: 1, limit: 100 });
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items.some((i: any) => i.item_code.includes('Test Item A') || i.name_ar.includes('Test Item A'))).toBe(true);
  });

  test('getInventoryReport returns empty for non-existent warehouse', async () => {
    const result = await inventoryReportService.getInventoryReport({ warehouse_id: 99999999, page: 1, limit: 100 });
    expect(result.items).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });

  test('getInventoryReport includes stock_summary for each item', async () => {
    const result = await inventoryReportService.getInventoryReport({ page: 1, limit: 10 });
    result.items.forEach((i: any) => {
      expect(i.stock_summary).toBeDefined();
      expect(i.stock_summary.total_movements).toBeDefined();
    });
  });

  test('getInventoryReport paginates correctly', async () => {
    const page1 = await inventoryReportService.getInventoryReport({ page: 1, limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.pagination.totalPages).toBeGreaterThanOrEqual(3);

    const page2 = await inventoryReportService.getInventoryReport({ page: 2, limit: 1 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).not.toBe(page1.items[0].id);
  });
});

describe('Item Card', () => {
  test('getItemCard returns full detail for valid item', async () => {
    const result = await itemsService.getItemCard(itemId1);
    expect(result.item).toBeDefined();
    expect(result.item.id).toBe(itemId1);
    expect(result.recent_movements).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.last_receiving_voucher).toBeDefined();
    expect(result.last_issuing_voucher).toBeDefined();
  });

  test('getItemCard throws for non-existent item', async () => {
    await expect(itemsService.getItemCard(99999999)).rejects.toThrow();
  });
});
