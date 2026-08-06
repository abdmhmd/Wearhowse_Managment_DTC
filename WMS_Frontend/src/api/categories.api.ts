import api from './client';
import type { ApiResponse, Category, PaginatedResponse, Subcategory } from '@/types';

export const categoriesApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Category>>('/categories', { params: { page, limit } }),

  getByCode: (code: string) =>
    api.get<ApiResponse<Category>>(`/categories/${code}`),

  create: (data: { code: string; name_ar: string; name_en?: string; parent_code?: string | null; description?: string }) =>
    api.post<ApiResponse<Category>>('/categories', data),

  update: (code: string, data: { name_ar?: string; name_en?: string; parent_code?: string | null; description?: string }) =>
    api.put<ApiResponse<Category>>(`/categories/${code}`, data),

  delete: (code: string) =>
    api.delete<ApiResponse<Category>>(`/categories/${code}`),

  getSubcategories: (code: string) =>
    api.get<ApiResponse<Subcategory[]>>(`/categories/${code}/subcategories`),

  createSubcategory: (code: string, data: { code: string; name_ar: string; name_en?: string; description?: string }) =>
    api.post<ApiResponse<Subcategory>>(`/categories/${code}/subcategories`, data),

  updateSubcategory: (id: number, data: { name_ar?: string; name_en?: string; description?: string; is_active?: boolean }) =>
    api.put<ApiResponse<Subcategory>>(`/categories/subcategories/${id}`, data),

  deleteSubcategory: (id: number) =>
    api.delete<ApiResponse<Subcategory>>(`/categories/subcategories/${id}`),
};
