import api from './client';
import type { ApiResponse, Transaction, TransactionDetail, PaginationMeta } from '@/types';

export interface TransactionHeaderInput {
  type: string;
  supplier_id?: number | null;
  department_id?: number | null;
  warehouse_id: number;
  notes?: string | null;
}

export interface TransactionDetailInput {
  item_id: number;
  quantity: number;
  unit_code: string;
  unit_price?: number;
  unit_cost?: number;
  total_value?: number;
}

export const transactionsApi = {
  getAll: (page = 1, limit = 20, type?: string, status?: string) =>
    api.get<ApiResponse<Transaction[]>>('/transactions', { params: { page, limit, type, status } }),

  getById: (id: number) =>
    api.get<ApiResponse<Transaction>>(`/transactions/${id}`),

  createDraft: (header: TransactionHeaderInput, details: TransactionDetailInput[]) =>
    api.post<ApiResponse<Transaction>>('/transactions', { header, details }),

  approve: (id: number) =>
    api.post<ApiResponse<{ message: string }>>(`/transactions/${id}/approve`),
};
