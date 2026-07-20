import api from './client';
import type { ApiResponse, StockMovement, PaginationMeta } from '@/types';

export const stockMovementsApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<ApiResponse<StockMovement[]>>('/stock-movements', { params: { page, limit } }),

  getByItemId: (itemId: number, page = 1, limit = 20) =>
    api.get<ApiResponse<StockMovement[]>>(`/stock-movements/item/${itemId}`, { params: { page, limit } }),

  getByTransactionId: (transactionId: number, page = 1, limit = 20) =>
    api.get<ApiResponse<StockMovement[]>>(`/stock-movements/transaction/${transactionId}`, { params: { page, limit } }),
};
