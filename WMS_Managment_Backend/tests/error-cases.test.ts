import { pool } from '../src/config/database';
import { categoriesService } from '../src/modules/categories/categories.service';
import { departmentsService } from '../src/modules/departments/departments.service';
import { itemsService } from '../src/modules/items/items.service';
import { suppliersService } from '../src/modules/suppliers/suppliers.service';
import { unitsService } from '../src/modules/units/units.service';
import { usersService } from '../src/modules/users/users.service';
import { warehousesService } from '../src/modules/warehouses/warehouses.service';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedItem, cleanup } from './helpers';
import { authorize } from '../src/middlewares/auth.middleware';
import { generateToken } from '../src/utils/jwt';
import { createUnitConversionSchema } from '../src/modules/unit-conversions/unit-conversions.validator';
import { createUserSchema } from '../src/modules/users/users.validator';
import { Request, Response } from 'express';

const prefix = `${TEST_PREFIX}err_test_`;

let catCode: string;
let unitCode: string;
let whId: number;
let userId: number;
let itemId: number;

beforeAll(async () => {
  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  userId = await seedUser();
  itemId = await seedItem(catCode, unitCode, whId, 100);
});

afterAll(async () => { await cleanup(prefix); });

// --- 400 Validation Error Tests ---

describe('400 Validation Errors', () => {
  describe('Categories', () => {
    test('create rejects missing required fields', async () => {
      await expect(categoriesService.createCategory({} as any)).rejects.toThrow();
    });
  });

  describe('Departments', () => {
    test('create rejects missing required fields', async () => {
      await expect(departmentsService.create({} as any)).rejects.toThrow();
    });
  });

  describe('Items', () => {
    test('create rejects missing required fields', async () => {
      await expect(itemsService.createItem({} as any)).rejects.toThrow();
    });

    test('create rejects non-existent category', async () => {
      await expect(itemsService.createItem({
        item_code: `${prefix}${shortId()}`,
        name_ar: 'Test',
        category_code: 'NONEXISTENT',
        unit_code: unitCode,
        warehouse_id: whId,
      })).rejects.toThrow(/not found/);
    });

    test('create rejects duplicate item_code', async () => {
      const code = `${prefix}${shortId()}`;
      await itemsService.createItem({
        item_code: code, name_ar: 'Test', category_code: catCode,
        unit_code: unitCode, warehouse_id: whId,
      });
      await expect(itemsService.createItem({
        item_code: code, name_ar: 'Test2', category_code: catCode,
        unit_code: unitCode, warehouse_id: whId,
      })).rejects.toThrow(/already exists/);
    });
  });

  describe('Suppliers', () => {
    test('create rejects missing required fields', async () => {
      await expect(suppliersService.create({} as any)).rejects.toThrow();
    });
  });

  describe('Units', () => {
    test('create rejects missing required fields', async () => {
      await expect(unitsService.create({} as any)).rejects.toThrow();
    });
  });

  describe('Unit Conversions', () => {
    test('create rejects negative factor', async () => {
      const parsed = createUnitConversionSchema.safeParse({
        item_id: itemId, from_unit_code: unitCode,
        to_unit_code: unitCode, factor: -1,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('Users', () => {
    test('create rejects short password', async () => {
      const parsed = createUserSchema.safeParse({
        username: `${prefix}${shortId()}`,
        password: '12345',
        full_name: 'Test',
        role: 'storekeeper',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('Warehouses', () => {
    test('create rejects missing required fields', async () => {
      await expect(warehousesService.create({} as any)).rejects.toThrow();
    });
  });
});

// --- 404 Not Found Tests ---

describe('404 Not Found Errors', () => {
  test('getCategoryByCode returns null for non-existent', async () => {
    const result = await categoriesService.getCategoryByCode('NONEXISTENT_CODE_XYZ');
    expect(result).toBeNull();
  });

  test('getDepartmentByCode returns null for non-existent', async () => {
    const result = await departmentsService.getByCode('NONEXISTENT_CODE_XYZ');
    expect(result).toBeNull();
  });

  test('getItemCard throws for non-existent', async () => {
    await expect(itemsService.getItemCard(999999999)).rejects.toThrow();
  });

  test('getSupplierById returns null for non-existent', async () => {
    const result = await suppliersService.getById(999999999);
    expect(result).toBeNull();
  });

  test('getUnitByCode returns null for non-existent', async () => {
    const result = await unitsService.getByCode('NONEXISTENT_CODE_XYZ');
    expect(result).toBeNull();
  });

  test('getUserById returns null for non-existent', async () => {
    const result = await usersService.getById(999999999);
    expect(result).toBeNull();
  });

  test('getWarehouseById returns null for non-existent', async () => {
    const result = await warehousesService.getById(999999999);
    expect(result).toBeNull();
  });

  test('getTransactionById returns null for non-existent', async () => {
    const { transactionsService } = await import('../src/modules/transactions/transactions.service');
    const result = await transactionsService.getById(999999999);
    expect(result).toBeNull();
  });
});

// --- 403 Forbidden (Authorization) Tests ---

describe('403 Forbidden Errors', () => {
  function mockReqRes(role: string): { req: Partial<Request>; res: Partial<Response> } {
    const json = jest.fn().mockReturnValue({});
    const status = jest.fn().mockReturnValue({ json });
    const token = generateToken({ userId: 1, username: 'test', role });
    const req = { user: { userId: 1, username: 'test', role }, headers: { authorization: `Bearer ${token}` } } as any;
    const res = { status, json } as Partial<Response>;
    return { req, res };
  }

  test('storekeeper cannot create categories', () => {
    const { req, res } = mockReqRes('storekeeper');
    const next = jest.fn();
    authorize(['warehouse_manager', 'system_admin'])(req as any, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  test('storekeeper cannot delete items', () => {
    const { req, res } = mockReqRes('storekeeper');
    const next = jest.fn();
    authorize(['system_admin'])(req as any, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  test('accountant cannot approve transactions', () => {
    const { req, res } = mockReqRes('accountant');
    const next = jest.fn();
    authorize(['warehouse_manager', 'system_admin'])(req as any, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(403);
  });

  test('warehouse_manager can create categories', () => {
    const { req, res } = mockReqRes('warehouse_manager');
    const next = jest.fn();
    authorize(['warehouse_manager', 'system_admin'])(req as any, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  test('system_admin can delete users', () => {
    const { req, res } = mockReqRes('system_admin');
    const next = jest.fn();
    authorize(['system_admin'])(req as any, res as Response, next);
    expect(next).toHaveBeenCalled();
  });
});
