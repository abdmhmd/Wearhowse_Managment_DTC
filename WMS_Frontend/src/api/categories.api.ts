import api from './client';
import type { ApiResponse, Category, PaginationMeta } from '@/types';

export interface CategoryListResponse {
  items: Category[];
  pagination: PaginationMeta;
}

export const categoriesApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<ApiResponse<Category[]>>('/categories', { params: { page, limit } }),

  getByCode: (code: string) =>
    api.get<ApiResponse<Category>>(`/categories/${code}`),

  create: (data: { code: string; name_ar: string; description?: string }) =>
    api.post<ApiResponse<Category>>('/categories', data),

  update: (code: string, data: { name_ar?: string; description?: string }) =>
    api.put<ApiResponse<Category>>(`/categories/${code}`, data),

  delete: (code: string) =>
    api.delete<ApiResponse<Category>>(`/categories/${code}`),
};
