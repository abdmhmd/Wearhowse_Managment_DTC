import { pool, runInTransaction } from '../../config/database';
import { PoolClient } from 'pg';
import { randomBytes } from 'crypto';
import { transactionsRepository, TransactionDetail } from './transactions.repository';
import { itemsRepository } from '../items/items.repository';
import { unitConversionsRepository } from '../unit-conversions/unit-conversions.repository';
import { stockMovementsRepository } from '../stock-movements/stock-movements.repository';
import { batchesRepository } from '../batches/batches.repository';
import { PaginationMeta } from '../../utils/response';
import { AppError, NotFoundError, ValidationError } from '../../utils/AppError';
import { scopeForUser, type DataScope } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export class TransactionsService {
  async generateTransactionNo(type: string, client?: PoolClient): Promise<string> {
    const q = client ?? pool;
    const res = await q.query("SELECT nextval('transaction_no_seq') AS seq");
    const seq = res.rows[0].seq;
    const year = new Date().getFullYear();
    return `${type}-${year}-${String(seq).padStart(6, '0')}`;
  }

  async getById(id: number, user?: AuthUserContext) {
    const header = await transactionsRepository.findHeaderById(id);
    if (!header) return null;
    if (user && !(await this.inScope(header, user))) return null;
    const details = await transactionsRepository.findDetailsByTransactionId(id);
    return { ...header, details };
  }

  private async inScope(header: { warehouse_id: number; to_warehouse_id?: number | null; department_id?: number | null }, user: AuthUserContext): Promise<boolean> {
    const scope: DataScope = scopeForUser(user);
    if (scope === 'GLOBAL') return true;
    if (scope === 'DEPARTMENT') {
      if (header.department_id === user.department_id) return true;
      const whIds = [header.warehouse_id, header.to_warehouse_id].filter((v): v is number => v != null);
      if (whIds.length === 0) return false;
      const res = await pool.query(
        'SELECT 1 FROM warehouses WHERE id = ANY($1) AND department_id = $2 AND is_active = true LIMIT 1',
        [whIds, user.department_id]
      );
      return res.rows.length > 0;
    }
    if (scope === 'WAREHOUSE') {
      return user.warehouse_ids.includes(header.warehouse_id) ||
        (header.to_warehouse_id != null && user.warehouse_ids.includes(header.to_warehouse_id));
    }
    return false;
  }

  async getAll(page = 1, limit = 20, type?: string, status?: string, user?: AuthUserContext): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    let where = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (type) { where += ` WHERE type = $${paramIndex++}`; params.push(type); }
    if (status) { where += where ? ` AND status = $${paramIndex++}` : ` WHERE status = $${paramIndex++}`; params.push(status); }

    // Data-scope enforcement (department/warehouse visibility).
    if (user) {
      const scope: DataScope = scopeForUser(user);
      if (scope === 'DEPARTMENT' && user.department_id != null) {
        const cond = where ? ' AND ' : ' WHERE ';
        // Transactions of the department itself OR involving the department's
        // own warehouses (e.g. LN vouchers issued from the department's main
        // warehouse).
        where += `${cond} (department_id = $${paramIndex++}
              OR warehouse_id IN (SELECT w.id FROM warehouses w WHERE w.department_id = $${paramIndex++} AND w.is_active = true)
              OR to_warehouse_id IN (SELECT w.id FROM warehouses w WHERE w.department_id = $${paramIndex++} AND w.is_active = true))`;
        params.push(user.department_id, user.department_id, user.department_id);
      } else if (scope === 'WAREHOUSE' && user.warehouse_ids.length > 0) {
        const cond = where ? ' AND ' : ' WHERE ';
        where += `${cond} (warehouse_id = ANY($${paramIndex++}) OR to_warehouse_id = ANY($${paramIndex++}))`;
        params.push(user.warehouse_ids, user.warehouse_ids);
      } else if (scope !== 'GLOBAL') {
        // Fail closed: a user with no resolvable department or warehouse scope
        // (e.g. a misconfigured warehouse_manager with zero assignments) must
        // never fall through to seeing all transactions.
        const cond = where ? ' AND ' : ' WHERE ';
        where += `${cond} FALSE`;
      }
    }

    const [itemsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, transaction_no, type, status, transaction_date, supplier_id, department_id, warehouse_id, to_warehouse_id, created_by, approved_by, notes, created_at, updated_at
         FROM transactions${where} ORDER BY transaction_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM transactions${where}`, params),
    ]);
    return { items: itemsRes.rows, pagination: { page, limit, total: countRes.rows[0].total, totalPages: Math.ceil(countRes.rows[0].total / limit) } };
  }

  async createDraft(
    header: { transaction_no?: string; type: string; supplier_id?: number | null; department_id?: number | null; warehouse_id: number; to_warehouse_id?: number | null; notes?: string | null; created_by: number },
    details: Omit<TransactionDetail, 'id' | 'transaction_id' | 'total_price'>[],
    client?: PoolClient
  ) {
    if (header.type === 'LN' && (header.department_id === undefined || header.department_id === null)) {
      throw new AppError('Department is required for Issuing (LN) transactions', 400, 'DEPARTMENT_REQUIRED', { type: header.type });
    }
    if (header.type === 'TRF') {
      if (!header.to_warehouse_id) {
        throw new AppError('Destination warehouse is required for Transfer (TRF) transactions', 400, 'TO_WAREHOUSE_REQUIRED');
      }
      if (header.to_warehouse_id === header.warehouse_id) {
        throw new AppError('Source and destination warehouses must be different', 400, 'SAME_WAREHOUSE');
      }
    }

    const execute = async (c: PoolClient) => {
      const transaction_no = header.transaction_no || await this.generateTransactionNo(header.type, c);
      const newHeader = await transactionsRepository.createHeader(c, { ...header, transaction_no, status: 'draft' } as any);

      const newDetails = [];
      for (const detail of details) {
        const item = await itemsRepository.getItemById(detail.item_id);
        if (!item) throw new ValidationError(`Item #${detail.item_id} not found`, { item_id: detail.item_id });

        if (!(await this.isUnitValidForItem(item.id, item.unit_code, detail.unit_code))) {
          throw new ValidationError(
            `Unit '${detail.unit_code}' is not valid for item '${item.item_code}'. Default unit is '${item.unit_code}'.`,
            { item_code: item.item_code, unit_code: detail.unit_code, default_unit: item.unit_code }
          );
        }

        const newDetail = await transactionsRepository.createDetail(c, { ...detail, transaction_id: newHeader.id! });
        newDetails.push(newDetail);
      }

      return { ...newHeader, details: newDetails };
    };

    if (client) return execute(client);
    return runInTransaction(execute);
  }

  /** An item can be transacted in its default unit or in a unit convertible from it */
  private async isUnitValidForItem(itemId: number, defaultUnit: string, unitCode: string): Promise<boolean> {
    if (!unitCode) return false;
    if (unitCode === defaultUnit) return true;
    const conversions = await unitConversionsRepository.findByItemId(itemId);
    return conversions.some(c => c.from_unit_code === defaultUnit && c.to_unit_code === unitCode);
  }

  private validateDetailExpiry(detail: any): void {
    if (detail.expiry_tracking_enabled && !detail.expiry_date) {
      throw new ValidationError(
        `Expiry date is required for item line (${detail.batch_number ? `batch ${detail.batch_number}` : 'no batch'}) when expiry tracking is enabled`,
        { item_id: detail.item_id }
      );
    }
    if (!detail.expiry_tracking_enabled && detail.expiry_date) {
      throw new ValidationError('Expiry date must be cleared when expiry tracking is disabled', { item_id: detail.item_id });
    }
    if (detail.production_date && detail.expiry_date && new Date(detail.production_date) > new Date(detail.expiry_date)) {
      throw new ValidationError('Production date must not be later than expiry date', { item_id: detail.item_id });
    }
  }

  private async generateBatchNumber(client: PoolClient): Promise<string> {
    const suffix = randomBytes(4).toString('hex').toUpperCase();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `BAT-${date}-${suffix}`;
  }

  async approveTransaction(transactionId: number, approvedBy: number, client?: PoolClient) {
    const execute = async (c: PoolClient) => {
      const headerRes = await c.query(
        'SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [transactionId]
      );
      const header = headerRes.rows[0];

      if (!header) throw new NotFoundError('Transaction', 'TRANSACTION_NOT_FOUND', { id: transactionId });
      if (header.status === 'approved') throw new ValidationError('Transaction is already approved', { transaction_no: header.transaction_no });

      const detailsRes = await c.query(
        'SELECT * FROM transaction_details WHERE transaction_id = $1', [transactionId]
      );
      const details = detailsRes.rows;

      let totalAmount = 0;
      const isInbound = ['RV', 'RTI'].includes(header.type);
      const isOutbound = ['LN', 'RTV'].includes(header.type);
      const isTransfer = header.type === 'TRF';
      const isAdjustment = header.type === 'ADJ';

      for (const detail of details) {
        const parsedQuantity = parseFloat(detail.quantity) || 0;

        this.validateDetailExpiry(detail);

        if (isTransfer) {
          // TRF: deduct from source warehouse, add to destination warehouse
          const sourceItem = await itemsRepository.findByIdForUpdate(c, detail.item_id);
          if (!sourceItem) throw new ValidationError(`Item ID ${detail.item_id} not found`, { item_id: detail.item_id });

          const sourceBalance = parseFloat(sourceItem.warehouse_balance ?? sourceItem.current_balance) || 0;
          if (sourceBalance < parsedQuantity) {
            throw new ValidationError(
              `Insufficient balance for item ${sourceItem.item_code} in source warehouse. Available: ${sourceBalance}, Required: ${parsedQuantity}`,
              { item_code: sourceItem.item_code, balance: sourceBalance, required: parsedQuantity }
            );
          }

          // Deduct from source
          const newSourceBalance = parseFloat((sourceBalance - parsedQuantity).toFixed(4));
          await itemsRepository.updateBalance(c, detail.item_id, newSourceBalance, header.warehouse_id);
          await stockMovementsRepository.logMovement(c, {
            item_id: detail.item_id, transaction_id: header.id, movement_type: 'OUT',
            quantity_before: sourceBalance, quantity_change: -parsedQuantity,
            quantity_after: newSourceBalance, user_id: approvedBy,
            warehouse_id: header.warehouse_id,
          });

          // Add to destination warehouse
          let destBalance = 0;
          const destStock = await itemsRepository.getWarehouseStock(c, detail.item_id, header.to_warehouse_id);
          if (destStock) {
            destBalance = parseFloat(destStock.current_balance) || 0;
          }
          const newDestBalance = parseFloat((destBalance + parsedQuantity).toFixed(4));
          await itemsRepository.updateBalance(c, detail.item_id, newDestBalance, header.to_warehouse_id);
          await stockMovementsRepository.logMovement(c, {
            item_id: detail.item_id, transaction_id: header.id, movement_type: 'IN',
            quantity_before: destBalance, quantity_change: parsedQuantity,
            quantity_after: newDestBalance, user_id: approvedBy,
            warehouse_id: header.to_warehouse_id,
          });

          // Update detail cost
          const unitCost = parseFloat(sourceItem.last_purchase_price) || 0;
          const totalValue = parseFloat((parsedQuantity * unitCost).toFixed(4));
          totalAmount = parseFloat((totalAmount + totalValue).toFixed(4));
          await c.query(
            'UPDATE transaction_details SET unit_cost = $1, total_value = $2 WHERE id = $3',
            [unitCost, totalValue, detail.id]
          );

          // Batch processing for TRF
          if (detail.batch_number) {
            const deducted = await batchesRepository.deductQuantity(
              c, detail.item_id, header.warehouse_id, detail.batch_number, parsedQuantity
            );
            if (!deducted) {
              throw new ValidationError(
                `Insufficient quantity in batch ${detail.batch_number} for item ${sourceItem.item_code}`,
                { item_code: sourceItem.item_code, batch_number: detail.batch_number, required: parsedQuantity }
              );
            }
            await batchesRepository.create(c, {
              item_id: detail.item_id,
              warehouse_id: header.to_warehouse_id,
              batch_number: detail.batch_number,
              quantity: parsedQuantity,
              unit_code: detail.unit_code,
              production_date: detail.production_date ?? null,
              expiry_date: detail.expiry_date ?? null,
              transaction_id: header.id,
            });
          }
        } else {
          // Standard IN/OUT transaction (RV, LN, RTV, RTI, ADJ)
          const item = await itemsRepository.findByIdForUpdate(c, detail.item_id);
          if (!item) throw new ValidationError(`Item ID ${detail.item_id} not found`, { item_id: detail.item_id });

          let quantityChange = 0;
          let movementType: 'IN' | 'OUT' = 'IN';

          if (isInbound || (isAdjustment && parsedQuantity >= 0)) {
            quantityChange = parsedQuantity;
            movementType = 'IN';
          } else if (isOutbound || (isAdjustment && parsedQuantity < 0)) {
            quantityChange = -parsedQuantity;
            movementType = 'OUT';
          }

          const quantityBefore = parseFloat(item.warehouse_balance ?? item.current_balance) || 0;
          // For ADJ the signed quantity is the balance delta directly; for other
          // types quantityChange already carries the correct sign.
          const balanceDelta = isAdjustment ? parsedQuantity : quantityChange;
          const newBalance = parseFloat((quantityBefore + balanceDelta).toFixed(4));

          if (newBalance < 0) {
            throw new ValidationError(
              `Insufficient balance for item ${item.item_code}. Available: ${quantityBefore}, Required: ${Math.abs(quantityChange)}`,
              { item_code: item.item_code, balance: quantityBefore, required: Math.abs(quantityChange) }
            );
          }

          let unitCost = 0;
          let totalValue = 0;

          if (isInbound) {
            unitCost = parseFloat(detail.unit_price) || 0;
            totalValue = parseFloat((parsedQuantity * unitCost).toFixed(4));
            await itemsRepository.updateLastPurchasePrice(c, item.id, unitCost);
          } else {
            unitCost = parseFloat(item.last_purchase_price) || 0;
            totalValue = parseFloat((parsedQuantity * unitCost).toFixed(4));
          }

          totalAmount = parseFloat((totalAmount + totalValue).toFixed(4));

          await c.query(
            'UPDATE transaction_details SET unit_cost = $1, total_value = $2 WHERE id = $3',
            [unitCost, totalValue, detail.id]
          );

          await itemsRepository.updateBalance(c, item.id, newBalance, header.warehouse_id);
          await stockMovementsRepository.logMovement(c, {
            item_id: item.id, transaction_id: header.id, movement_type: movementType,
            quantity_before: quantityBefore, quantity_change: quantityChange,
            quantity_after: newBalance, user_id: approvedBy,
            warehouse_id: header.warehouse_id,
          });

          // Batch processing
          if (movementType === 'IN') {
            if (detail.batch_number || isInbound) {
              const batchNumber = detail.batch_number || await this.generateBatchNumber(c);
              await batchesRepository.create(c, {
                item_id: item.id,
                warehouse_id: header.warehouse_id,
                batch_number: batchNumber,
                quantity: parsedQuantity,
                unit_code: detail.unit_code,
                production_date: detail.production_date ?? null,
                expiry_date: detail.expiry_date ?? null,
                supplier_id: header.supplier_id,
                transaction_id: header.id,
              });
            }
          } else if (movementType === 'OUT') {
            if (detail.batch_number) {
              const deducted = await batchesRepository.deductQuantity(
                c, item.id, header.warehouse_id, detail.batch_number, parsedQuantity
              );
              if (!deducted) {
                throw new ValidationError(
                  `Insufficient quantity in batch ${detail.batch_number} for item ${item.item_code}`,
                  { item_code: item.item_code, batch_number: detail.batch_number, required: parsedQuantity }
                );
              }
            }
          }
        }
      }

      await transactionsRepository.updateStatus(c, header.id, 'approved', approvedBy);

      if (totalAmount > 0) {
        await this.createJournalEntry(c, header, totalAmount, approvedBy);
      }

      return { message: 'Transaction approved successfully' };
    };

    if (client) return execute(client);
    return runInTransaction(execute);
  }

  private async createJournalEntry(client: any, header: any, totalAmount: number, userId: number): Promise<void> {
    const inventoryAccount = await transactionsRepository.getSetting('inventory_account') || 'Inventory';
    const supplierAccount = await transactionsRepository.getSetting('supplier_account') || 'Suppliers';
    const expensePrefix = await transactionsRepository.getSetting('expense_account_prefix') || 'Expense_';

    const isInbound = ['RV', 'RTI'].includes(header.type);

    if (isInbound) {
      await transactionsRepository.createJournalEntry(client, {
        transaction_id: header.id,
        account_debit: inventoryAccount,
        account_credit: supplierAccount,
        amount: totalAmount,
        description: `${header.type} ${header.transaction_no} - Inventory receipt`,
        created_by: userId,
      });
    } else if (header.type === 'TRF') {
      await transactionsRepository.createJournalEntry(client, {
        transaction_id: header.id,
        account_debit: `${inventoryAccount}_Transfer`,
        account_credit: inventoryAccount,
        amount: totalAmount,
        description: `TRF ${header.transaction_no} - Warehouse transfer`,
        created_by: userId,
      });
    } else {
      let deptName = 'General';
      if (header.department_id) {
        const deptRes = await client.query('SELECT name_ar, name_en FROM departments WHERE id = $1', [header.department_id]);
        deptName = deptRes.rows[0]?.name_en || deptRes.rows[0]?.name_ar || 'General';
      }
      await transactionsRepository.createJournalEntry(client, {
        transaction_id: header.id,
        account_debit: `${expensePrefix}${deptName}`,
        account_credit: inventoryAccount,
        amount: totalAmount,
        description: `${header.type} ${header.transaction_no} - Issued to ${deptName}`,
        created_by: userId,
      });
    }
  }
}
export const transactionsService = new TransactionsService();
