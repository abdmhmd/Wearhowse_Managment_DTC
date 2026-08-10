import { PoolClient } from 'pg';
import { pool } from '../../config/database';

export interface TransactionHeader {
  id?: number;
  transaction_no: string;
  type: 'RV' | 'LN' | 'RTV' | 'RTI' | 'ADJ' | 'TRF';
  status: 'draft' | 'approved';
  transaction_date?: Date;
  supplier_id?: number | null;
  department_id?: number | null;
  warehouse_id: number;
  to_warehouse_id?: number | null;
  created_by: number;
  approved_by?: number | null;
  notes?: string | null;
}

export interface TransactionDetail {
  id?: number;
  transaction_id: number;
  item_id: number;
  quantity: number;
  unit_code: string;
  unit_price?: number;
  total_price?: number;
  unit_cost?: number;
  total_value?: number;
  batch_number?: string | null;
  production_date?: string | Date | null;
  expiry_date?: string | Date | null;
  expiry_tracking_enabled?: boolean;
}

export interface StockMovement {
  id?: number;
  item_id: number;
  transaction_id: number;
  movement_type: 'IN' | 'OUT';
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  user_id: number;
}

export class TransactionsRepository {
  async createHeader(client: PoolClient, header: TransactionHeader): Promise<TransactionHeader> {
    const query = `
      INSERT INTO transactions (transaction_no, type, status, supplier_id, department_id, warehouse_id, to_warehouse_id, created_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      header.transaction_no,
      header.type,
      header.status || 'draft',
      header.supplier_id || null,
      header.department_id || null,
      header.warehouse_id,
      header.to_warehouse_id || null,
      header.created_by,
      header.notes || null,
    ];
    const res = await client.query(query, values);
    return res.rows[0];
  }

  async createDetail(client: PoolClient, detail: Omit<TransactionDetail, 'id' | 'total_price'>): Promise<TransactionDetail> {
    const query = `
      INSERT INTO transaction_details (transaction_id, item_id, quantity, unit_code, unit_price, unit_cost, total_value, batch_number, production_date, expiry_date, expiry_tracking_enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const values = [
      detail.transaction_id,
      detail.item_id,
      detail.quantity,
      detail.unit_code,
      detail.unit_price ?? 0,
      detail.unit_cost ?? null,
      detail.total_value ?? null,
      detail.batch_number ?? null,
      detail.production_date ?? null,
      detail.expiry_date ?? null,
      detail.expiry_tracking_enabled ?? false,
    ];
    const res = await client.query(query, values);
    return res.rows[0];
  }

  async findHeaderById(id: number): Promise<TransactionHeader | null> {
    const res = await pool.query(
      `SELECT t.id, t.transaction_no, t.type, t.status, t.transaction_date,
              t.supplier_id, t.department_id, t.warehouse_id, t.to_warehouse_id,
              t.created_by, t.approved_by, t.notes, t.created_at, t.updated_at,
              w.code AS warehouse_code, w.name_ar AS warehouse_name_ar, w.name_en AS warehouse_name_en,
              tw.code AS to_warehouse_code, tw.name_ar AS to_warehouse_name_ar, tw.name_en AS to_warehouse_name_en,
              d.name_ar AS department_name_ar, d.name_en AS department_name_en,
              s.name_ar AS supplier_name_ar, s.name_en AS supplier_name_en,
              cu.username AS created_by_username, cu.full_name AS created_by_name,
              au.username AS approved_by_username, au.full_name AS approved_by_name
       FROM transactions t
       LEFT JOIN warehouses w ON w.id = t.warehouse_id
       LEFT JOIN warehouses tw ON tw.id = t.to_warehouse_id
       LEFT JOIN departments d ON d.id = t.department_id
       LEFT JOIN suppliers s ON s.id = t.supplier_id
       LEFT JOIN users cu ON cu.id = t.created_by
       LEFT JOIN users au ON au.id = t.approved_by
       WHERE t.id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  async findDetailsByTransactionId(transactionId: number): Promise<TransactionDetail[]> {
    const res = await pool.query(
      `SELECT td.id, td.transaction_id, td.item_id, td.quantity, td.unit_code, td.unit_price, td.total_price, td.unit_cost, td.total_value,
              td.batch_number, td.production_date, td.expiry_date, td.expiry_tracking_enabled,
              i.item_code, i.name_ar AS item_name_ar, i.name_en AS item_name_en
       FROM transaction_details td
       LEFT JOIN items i ON i.id = td.item_id
       WHERE td.transaction_id = $1`, [transactionId]
    );
    return res.rows;
  }

  async updateStatus(client: PoolClient, id: number, status: 'draft' | 'approved', approvedBy: number): Promise<void> {
    await client.query(
      'UPDATE transactions SET status = $1, approved_by = $2 WHERE id = $3',
      [status, approvedBy, id]
    );
  }

  async createJournalEntry(client: PoolClient, entry: {
    transaction_id: number;
    account_debit: string;
    account_credit: string;
    amount: number;
    description: string;
    created_by: number;
  }): Promise<void> {
    await client.query(
      `INSERT INTO journal_entries (transaction_id, account_debit, account_credit, amount, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.transaction_id, entry.account_debit, entry.account_credit, entry.amount, entry.description, entry.created_by]
    );
  }

  async getSetting(key: string): Promise<string | null> {
    const res = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
    return res.rows.length > 0 ? res.rows[0].value : null;
  }
}

export const transactionsRepository = new TransactionsRepository();
