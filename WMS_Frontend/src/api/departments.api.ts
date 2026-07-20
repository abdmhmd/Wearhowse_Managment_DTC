import api from './client';
import type { ApiResponse, Department, PaginationMeta } from '@/types';

export const departmentsApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<ApiResponse<Department[]>>('/departments', { params: { page, limit } }),

  getByCode: (code: string) =>
    api.get<ApiResponse<Department>>(`/departments/${code}`),

  create: (data: { code: string; name_ar: string }) =>
    api.post<ApiResponse<Department>>('/departments', data),

  update: (code: string, data: { name_ar?: string }) =>
    api.put<ApiResponse<Department>>(`/departments/${code}`, data),

  delete: (code: string) =>
    api.delete<ApiResponse<Department>>(`/departments/${code}`),
};
