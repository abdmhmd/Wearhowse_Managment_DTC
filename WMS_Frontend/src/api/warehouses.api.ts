import api from './client';
import type { ApiResponse, PaginatedResponse, Warehouse } from '@/types';

export const warehousesApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Warehouse>>('/warehouses', { params: { page, limit } }),

  getById: (id: number) =>
    api.get<ApiResponse<Warehouse>>(`/warehouses/${id}`),

  create: (data: { code: string; name_ar: string; location?: string }) =>
    api.post<ApiResponse<Warehouse>>('/warehouses', data),

  update: (id: number, data: { code?: string; name_ar?: string; location?: string }) =>
    api.put<ApiResponse<Warehouse>>(`/warehouses/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<Warehouse>>(`/warehouses/${id}`),
};
