import api from './client';
import type { ApiResponse, UnitConversion, PaginationMeta } from '@/types';

export const unitConversionsApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<ApiResponse<UnitConversion[]>>('/unit-conversions', { params: { page, limit } }),

  getByItemId: (itemId: number) =>
    api.get<ApiResponse<UnitConversion[]>>(`/unit-conversions/item/${itemId}`),

  create: (data: { item_id: number; from_unit_code: string; to_unit_code: string; factor: number }) =>
    api.post<ApiResponse<UnitConversion>>('/unit-conversions', data),

  update: (id: number, data: { from_unit_code?: string; to_unit_code?: string; factor?: number }) =>
    api.put<ApiResponse<UnitConversion>>(`/unit-conversions/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<UnitConversion>>(`/unit-conversions/${id}`),
};
