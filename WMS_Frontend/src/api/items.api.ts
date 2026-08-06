import api from './client';
import type { ApiResponse, Item, ItemCard, PaginatedResponse } from '@/types';

export interface ItemsFilter {
  category_code?: string;
  warehouse_id?: number;
  search?: string;
  is_active?: string;
  subcategory_id?: number;
}

export const itemsApi = {
  getAll: (page = 1, limit = 20, filter?: ItemsFilter) =>
    api.get<PaginatedResponse<Item>>('/items', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<Item>>(`/items/${id}`),

  getCard: (id: number) =>
    api.get<ApiResponse<ItemCard>>(`/items/${id}`),

  generateCode: (categoryCode: string) =>
    api.get<ApiResponse<{ item_code: string }>>(`/items/generate-code/${categoryCode}`),

  create: (data: {
    name_ar: string; name_en?: string; description?: string;
    category_code: string; subcategory_id?: number | null; unit_code: string; warehouse_id: number;
    min_stock_level?: number; max_stock_level?: number;
    opening_price?: number; location?: string;
    is_consumable?: boolean; expiry_alert_days?: number;
    sap_material_number?: string; gl_account?: string;
  }) => api.post<ApiResponse<Item>>('/items', data),

  update: (id: number, data: Partial<Item>) =>
    api.put<ApiResponse<Item>>(`/items/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<Item>>(`/items/${id}`),
};
