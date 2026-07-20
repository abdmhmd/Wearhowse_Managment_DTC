import api from './client';
import type { ApiResponse, Unit, PaginationMeta } from '@/types';

export const unitsApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<ApiResponse<Unit[]>>('/units', { params: { page, limit } }),

  getByCode: (code: string) =>
    api.get<ApiResponse<Unit>>(`/units/${code}`),

  create: (data: { code: string; name_ar: string; name_en: string }) =>
    api.post<ApiResponse<Unit>>('/units', data),

  update: (code: string, data: { name_ar?: string; name_en?: string }) =>
    api.put<ApiResponse<Unit>>(`/units/${code}`, data),

  delete: (code: string) =>
    api.delete<ApiResponse<Unit>>(`/units/${code}`),
};
