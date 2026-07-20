import api from './client';
import type { ApiResponse, Item, ItemCard, PaginationMeta } from '@/types';

export interface ItemsFilter {
  category_code?: string;
  warehouse_id?: number;
  search?: string;
  is_active?: string;
}

export const itemsApi = {
  getAll: (page = 1, limit = 20, filter?: ItemsFilter) =>
    api.get<ApiResponse<Item[]>>('/items', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<Item>>(`/items/${id}`),

  getCard: (id: number) =>
    api.get<ApiResponse<ItemCard>>(`/items/${id}`),

  create: (data: {
    item_code: string; name_ar: string; description?: string;
    category_code: string; unit_code: string; warehouse_id: number;
    min_stock_level?: number; max_stock_level?: number; location?: string;
  }) => api.post<ApiResponse<Item>>('/items', data),

  update: (id: number, data: Partial<Item>) =>
    api.put<ApiResponse<Item>>(`/items/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<Item>>(`/items/${id}`),
};
