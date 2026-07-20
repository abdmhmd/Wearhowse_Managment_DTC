import { pool } from '../../config/database';
import { transactionsRepository, TransactionDetail } from './transactions.repository';
import { itemsRepository } from '../items/items.repository';
import { stockMovementsRepository } from '../stock-movements/stock-movements.repository';
import { PaginationMeta } from '../../utils/response';
import { AppError, NotFoundError, ValidationError } from '../../utils/AppError';

export class TransactionsService {
  async generateTransactionNo(type: string): Promise<string> {
    const res = await pool.query("SELECT nextval('transaction_no_seq') AS seq");
    const seq = res.rows[0].seq;
    const year = new Date().getFullYear();
    return `${type}-${year}-${String(seq).padStart(6, '0')}`;
  }

  async getById(id: number) {
    const header = await transactionsRepository.findHeaderById(id);
    if (!header) return null;
    const details = await transactionsRepository.findDetailsByTransactionId(id);
    return { ...header, details };
  }

  async getAll(page = 1, limit = 20, type?: string, status?: string): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    let where = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (type) { where += ` WHERE type = $${paramIndex++}`; params.push(type); }
    if (status) { where += where ? ` AND status = $${paramIndex++}` : ` WHERE status = $${paramIndex++}`; params.push(status); }

    const [itemsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, transaction_no, type, status, transaction_date, supplier_id, department_id, warehouse_id, created_by, approved_by, notes, created_at, updated_at
         FROM transactions${where} ORDER BY transaction_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM transactions${where}`, params),
    ]);
    return { items: itemsRes.rows, pagination: { page, limit, total: countRes.rows[0].total, totalPages: Math.ceil(countRes.rows[0].total / limit) } };
  }

  async createDraft(
    header: { transaction_no?: string; type: string; supplier_id?: number | null; department_id?: number | null; warehouse_id: number; notes?: string | null; created_by: number },
    details: Omit<TransactionDetail, 'id' | 'transaction_id' | 'total_price'>[]
  ) {
    if (header.type === 'LN' && (header.department_id === undefined || header.department_id === null)) {
      throw new AppError('Department is required for Issuing (LN) transactions', 400, 'DEPARTMENT_REQUIRED', { type: header.type });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const transaction_no = header.transaction_no || await this.generateTransactionNo(header.type);
      const newHeader = await transactionsRepository.createHeader(client, { ...header, transaction_no, status: 'draft' } as any);

      const newDetails = [];
      for (const detail of details) {
        const newDetail = await transactionsRepository.createDetail(client, { ...detail, transaction_id: newHeader.id! });
        newDetails.push(newDetail);
      }

      await client.query('COMMIT');
      return { ...newHeader, details: newDetails };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async approveTransaction(transactionId: number, approvedBy: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const headerRes = await client.query(
        'SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [transactionId]
      );
      const header = headerRes.rows[0];

      if (!header) throw new NotFoundError('Transaction', 'TRANSACTION_NOT_FOUND', { id: transactionId });
      if (header.status === 'approved') throw new ValidationError('Transaction is already approved', { transaction_no: header.transaction_no });

      const detailsRes = await client.query(
        'SELECT * FROM transaction_details WHERE transaction_id = $1', [transactionId]
      );
      const details = detailsRes.rows;

      for (const detail of details) {
        const item = await itemsRepository.findByIdForUpdate(client, detail.item_id);
        if (!item) throw new ValidationError(`Item ID ${detail.item_id} not found`, { item_id: detail.item_id });

        let quantityChange = 0;
        let movementType: 'IN' | 'OUT' = 'IN';
        const parsedQuantity = parseFloat(detail.quantity);

        switch (header.type) {
          case 'RV': case 'RTI':
            quantityChange = parsedQuantity; movementType = 'IN'; break;
          case 'LN': case 'RTV':
            quantityChange = -parsedQuantity; movementType = 'OUT'; break;
          case 'ADJ': case 'TRF':
            quantityChange = parsedQuantity; movementType = parsedQuantity >= 0 ? 'IN' : 'OUT'; break;
          default:
            throw new ValidationError(`Unknown transaction type: ${header.type}`, { type: header.type });
        }

        const quantityBefore = parseFloat(item.current_balance);
        const newBalance = quantityBefore + quantityChange;

        if (newBalance < 0) {
          throw new ValidationError(
            `Insufficient balance for item ${item.item_code}. Available: ${quantityBefore}, Required: ${Math.abs(quantityChange)}`,
            { item_code: item.item_code, balance: quantityBefore, required: Math.abs(quantityChange) }
          );
        }

        await itemsRepository.updateBalance(client, item.id, newBalance);
        await stockMovementsRepository.logMovement(client, {
          item_id: item.id, transaction_id: header.id, movement_type: movementType,
          quantity_before: quantityBefore, quantity_change: quantityChange,
          quantity_after: newBalance, user_id: approvedBy,
        });
      }

      await transactionsRepository.updateStatus(client, header.id, 'approved', approvedBy);
      await client.query('COMMIT');
      return { message: 'Transaction approved successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
export const transactionsService = new TransactionsService();
