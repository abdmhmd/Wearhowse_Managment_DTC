import api from './client';
import type { ApiResponse, Custody, CustodyStatus } from '@/types';

export interface CustodiesFilter {
  status?: CustodyStatus;
  assigned_to?: number;
  project_id?: number;
  warehouse_id?: number;
}

export const custodiesApi = {
  getAll: (page = 1, limit = 20, filter?: CustodiesFilter) =>
    api.get<ApiResponse<Custody[]>>('/custodies', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<Custody>>(`/custodies/${id}`),

  returnItem: (id: number, notes?: string) =>
    api.post<ApiResponse<Custody>>(`/custodies/${id}/return`, { notes }),
};
