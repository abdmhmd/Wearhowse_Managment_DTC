import api from './client';
import type { ApiResponse, Supplier, PaginationMeta } from '@/types';

export const suppliersApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<ApiResponse<Supplier[]>>('/suppliers', { params: { page, limit } }),

  getById: (id: number) =>
    api.get<ApiResponse<Supplier>>(`/suppliers/${id}`),

  create: (data: { name_ar: string; phone?: string; email?: string; address?: string }) =>
    api.post<ApiResponse<Supplier>>('/suppliers', data),

  update: (id: number, data: { name_ar?: string; phone?: string; email?: string; address?: string }) =>
    api.put<ApiResponse<Supplier>>(`/suppliers/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<Supplier>>(`/suppliers/${id}`),
};
