import api from './client';
import type { ApiResponse, Custody, CustodyCondition, CustodyStatus, PaginatedResponse } from '@/types';

export interface CustodiesFilter {
  status?: CustodyStatus;
  assigned_to?: number;
  project_id?: number;
  warehouse_id?: number;
}

export interface ReturnItemPayload {
  notes?: string;
  condition?: CustodyCondition;
  /** Quantity returned in good condition. Omit for a full return. */
  returned_quantity?: number;
}

export const custodiesApi = {
  getAll: (page = 1, limit = 20, filter?: CustodiesFilter) =>
    api.get<PaginatedResponse<Custody>>('/custodies', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<Custody>>(`/custodies/${id}`),

  returnItem: (id: number, payload: ReturnItemPayload = {}) =>
    api.post<ApiResponse<{ message: string; transaction_id?: number; transaction_no?: string; pending_return_quantity?: number }>>(`/custodies/${id}/return`, payload),

  receiveReturn: (id: number) =>
    api.post<ApiResponse<{ message: string; transaction_id: number; transaction_no: string }>>(`/custodies/${id}/receive`),
};
