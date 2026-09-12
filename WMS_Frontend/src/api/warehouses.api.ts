import api from './client';
import type { ApiResponse, PaginatedResponse, Warehouse } from '@/types';

export interface WarehouseListFilter {
  department_id?: number;
  is_main?: boolean;
}

export type WarehouseInput = {
  code: string;
  name_ar: string;
  name_en?: string;
  location?: string;
  is_main?: boolean;
  department_id?: number | null;
};

export const warehousesApi = {
  getAll: (page = 1, limit = 20, filter?: WarehouseListFilter) =>
    api.get<PaginatedResponse<Warehouse>>('/warehouses', {
      params: { page, limit, department_id: filter?.department_id, is_main: filter?.is_main },
    }),

  getById: (id: number) =>
    api.get<ApiResponse<Warehouse>>(`/warehouses/${id}`),

  create: (data: WarehouseInput) =>
    api.post<ApiResponse<Warehouse>>('/warehouses', data),

  update: (id: number, data: Partial<WarehouseInput>) =>
    api.put<ApiResponse<Warehouse>>(`/warehouses/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<Warehouse>>(`/warehouses/${id}`),
};
