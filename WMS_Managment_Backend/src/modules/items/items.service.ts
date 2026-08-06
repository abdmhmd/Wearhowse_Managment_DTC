import { itemsRepository, ItemsFilter } from './items.repository';
import { categoriesRepository } from '../categories/categories.repository';
import { subcategoriesRepository } from '../categories/subcategories.repository';
import { unitsRepository } from '../units/units.repository';
import { warehousesRepository } from '../warehouses/warehouses.repository';
import { pool } from '../../config/database';
import { PaginationMeta } from '../../utils/response';
import { AppError, NotFoundError, ValidationError } from '../../utils/AppError';

export class ItemsService {
  async generateItemCode(categoryCode: string): Promise<string> {
    const cat = await categoriesRepository.findByCode(categoryCode);
    if (!cat) throw new ValidationError(`Category '${categoryCode}' not found`, { code: categoryCode });
    const rawPrefix = cat.prefix || cat.code;
    const safePrefix = rawPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const res = await pool.query(
      `SELECT item_code FROM items WHERE item_code ~ $1 ORDER BY id DESC LIMIT 1`,
      [`^${safePrefix}-[0-9]+$`]
    );
    let nextNum = 1;
    if (res.rows.length > 0) {
      const lastCode = res.rows[0].item_code;
      const parts = lastCode.split('-');
      const numPart = parseInt(parts[parts.length - 1], 10);
      nextNum = (numPart || 0) + 1;
    }
    return `${rawPrefix}-${nextNum}`;
  }

  async getAll(page = 1, limit = 20, filter?: ItemsFilter): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      itemsRepository.findAll(limit, offset, filter),
      itemsRepository.countAll(filter),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async validateItemData(data: Record<string, any>, isUpdate = false, existing: Record<string, any> | null = null): Promise<void> {
    const required = ['name_ar', 'category_code', 'unit_code', 'warehouse_id'];
    for (const field of required) {
      if (!isUpdate || data[field] !== undefined) {
        if (!data[field] && data[field] !== 0) {
          throw new ValidationError(`Field '${field}' is required`, { field });
        }
      }
    }

    if (data.category_code) {
      const cat = await categoriesRepository.findByCode(data.category_code);
      if (!cat) throw new ValidationError(`Category '${data.category_code}' not found`, { code: data.category_code });
    }
    if (data.subcategory_id != null) {
      const sub = await subcategoriesRepository.findById(data.subcategory_id);
      if (!sub) {
        throw new ValidationError(`Subcategory #${data.subcategory_id} not found`, { subcategory_id: data.subcategory_id });
      }
      const effectiveCategory = data.category_code ?? existing?.category_code;
      if (effectiveCategory && sub.category_code !== effectiveCategory) {
        throw new ValidationError(
          `Subcategory '${sub.code}' does not belong to category '${effectiveCategory}'`,
          { subcategory_id: data.subcategory_id, category_code: effectiveCategory }
        );
      }
    }
    if (data.unit_code) {
      const u = await unitsRepository.findByCode(data.unit_code);
      if (!u) throw new ValidationError(`Unit '${data.unit_code}' not found`, { code: data.unit_code });
    }
    if (data.warehouse_id) {
      const wh = await warehousesRepository.findById(data.warehouse_id);
      if (!wh) throw new ValidationError(`Warehouse #${data.warehouse_id} not found`, { id: data.warehouse_id });
    }
    if (data.item_code) {
      const exists = await itemsRepository.findByItemCode(data.item_code);
      if (exists && (!isUpdate || exists.id !== data.id)) {
        throw new AppError(`Item code '${data.item_code}' already exists`, 409, 'DUPLICATE_ITEM_CODE', { code: data.item_code });
      }
    }
  }

  async createItem(data: {
    name_ar: string; description?: string;
    item_code?: string;
    category_code: string; subcategory_id?: number | null;
    unit_code: string; warehouse_id: number;
    min_stock_level?: number; max_stock_level?: number;
    current_balance?: number; opening_price?: number; location?: string;
    is_consumable?: boolean;
    expiry_alert_days?: number;
    sap_material_number?: string | null;
    gl_account?: string | null;
  }) {
    const item_code = data.item_code || await this.generateItemCode(data.category_code);
    const openingPrice = data.opening_price || 0;
    await this.validateItemData({ ...data, item_code });
    const item = await itemsRepository.createItem({ ...data, item_code, last_purchase_price: openingPrice, opening_price: openingPrice } as any);
    
    // Initialize stock for the primary warehouse
    const client = await pool.connect();
    try {
      await itemsRepository.initWarehouseStock(
        client,
        item.id,
        data.warehouse_id,
        data.current_balance || 0,
        data.min_stock_level || 0,
        data.max_stock_level || 999999
      );
    } finally {
      client.release();
    }

    return item;
  }

  async updateItem(id: number, data: Partial<any>) {
    const existing = await itemsRepository.getItemById(id);
    if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND', { id });
    await this.validateItemData({ ...data, id }, true, existing);
    return itemsRepository.updateItem(id, data);
  }

  async deleteItem(id: number) {
    const existing = await itemsRepository.getItemById(id);
    if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND', { id });

    const txnCheck = await pool.query(
      'SELECT 1 FROM transaction_details WHERE item_id = $1 LIMIT 1', [id]
    );
    if (txnCheck.rows.length > 0) {
      throw new AppError(`Cannot delete item #${id} — there are related transactions`, 409, 'ITEM_HAS_TRANSACTIONS', { id });
    }
    return itemsRepository.deleteItem(id);
  }

  async getItemCard(item_id: number) {
    const item = await pool.query(
      `SELECT i.*, c.name_ar AS category_name_ar, c.name_en AS category_name_en,
              sc.name_ar AS subcategory_name_ar, sc.name_en AS subcategory_name_en,
              u.name_ar AS unit_name_ar, u.name_en AS unit_name_en,
              w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en
       FROM items i
       LEFT JOIN categories c ON c.code = i.category_code
       LEFT JOIN subcategories sc ON sc.id = i.subcategory_id
       LEFT JOIN units u ON u.code = i.unit_code
       LEFT JOIN warehouses w ON w.id = i.warehouse_id
       WHERE i.id = $1`, [item_id]
    );
    if (item.rows.length === 0) throw new NotFoundError('Item', 'ITEM_NOT_FOUND', { id: item_id });

    const [movements, summary, lastReceiving, lastIssuing, warehouseStock] = await Promise.all([
      pool.query(
        `SELECT sm.*, t.transaction_no, t.type AS transaction_type, t.transaction_date,
                td.unit_cost, td.total_value
         FROM stock_movements sm
         JOIN transactions t ON t.id = sm.transaction_id
         LEFT JOIN transaction_details td ON td.transaction_id = sm.transaction_id AND td.item_id = sm.item_id
         WHERE sm.item_id = $1 ORDER BY sm.movement_date DESC LIMIT 20`, [item_id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total_movements,
                COALESCE(SUM(CASE WHEN sm.movement_type = 'IN' THEN sm.quantity_change ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN sm.movement_type = 'OUT' THEN sm.quantity_change ELSE 0 END), 0) AS total_out
         FROM stock_movements sm WHERE sm.item_id = $1`, [item_id]
      ),
      pool.query(
        `SELECT t.id, t.transaction_no, t.transaction_date, t.notes, td.quantity, td.unit_price, s.name_ar AS supplier_name_ar, s.name_en AS supplier_name_en
         FROM transactions t JOIN transaction_details td ON td.transaction_id = t.id LEFT JOIN suppliers s ON s.id = t.supplier_id
         WHERE td.item_id = $1 AND t.type = 'RV' ORDER BY t.transaction_date DESC LIMIT 1`, [item_id]
      ),
      pool.query(
        `SELECT t.id, t.transaction_no, t.transaction_date, t.notes, td.quantity, td.unit_price, d.name_ar AS department_name_ar, d.name_en AS department_name_en
         FROM transactions t JOIN transaction_details td ON td.transaction_id = t.id LEFT JOIN departments d ON d.id = t.department_id
         WHERE td.item_id = $1 AND t.type = 'LN' ORDER BY t.transaction_date DESC LIMIT 1`, [item_id]
      ),
      itemsRepository.getStockByWarehouse(item_id),
    ]);

    return {
      item: item.rows[0],
      warehouse_stock: warehouseStock,
      recent_movements: movements.rows,
      summary: summary.rows[0],
      last_receiving_voucher: lastReceiving.rows[0] || null,
      last_issuing_voucher: lastIssuing.rows[0] || null,
    };
  }
}
export const itemsService = new ItemsService();
