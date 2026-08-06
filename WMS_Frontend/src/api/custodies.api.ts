import api from './client';
import type { ApiResponse, Custody, CustodyStatus, PaginatedResponse } from '@/types';

export interface CustodiesFilter {
  status?: CustodyStatus;
  assigned_to?: number;
  project_id?: number;
  warehouse_id?: number;
}

export const custodiesApi = {
  getAll: (page = 1, limit = 20, filter?: CustodiesFilter) =>
    api.get<PaginatedResponse<Custody>>('/custodies', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<Custody>>(`/custodies/${id}`),

  returnItem: (id: number, notes?: string) =>
    api.post<ApiResponse<{ message: string; transaction_id: number; transaction_no: string }>>(`/custodies/${id}/return`, { notes }),
};
