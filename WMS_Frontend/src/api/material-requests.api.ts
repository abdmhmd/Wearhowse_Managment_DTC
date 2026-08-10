import api from './client';
import type { ApiResponse, MaterialRequest, PaginatedResponse, RequestStatus, RequestType } from '@/types';

export interface MaterialRequestsFilter {
  status?: RequestStatus;
  department_id?: number;
  warehouse_id?: number;
  request_type?: RequestType;
}

export interface CreateMaterialRequestPayload {
  department_id: number;
  warehouse_id: number;
  request_type: RequestType;
  project_id?: number | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  needed_by?: string;
  notes?: string;
  items: Array<{ item_id: number; quantity: number; unit_code: string; notes?: string }>;
}

export const materialRequestsApi = {
  getAll: (page = 1, limit = 20, filter?: MaterialRequestsFilter) =>
    api.get<PaginatedResponse<MaterialRequest>>('/requests', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<MaterialRequest>>(`/requests/${id}`),

  create: (data: CreateMaterialRequestPayload) =>
    api.post<ApiResponse<MaterialRequest>>('/requests', data),

  approve: (id: number) =>
    api.patch<ApiResponse<MaterialRequest>>(`/requests/${id}/approve`),

  forward: (id: number) =>
    api.patch<ApiResponse<MaterialRequest>>(`/requests/${id}/forward`),

  reject: (id: number, reason: string) =>
    api.patch<ApiResponse<MaterialRequest>>(`/requests/${id}/reject`, { reason }),

  issue: (id: number) =>
    api.post<ApiResponse<MaterialRequest>>(`/requests/${id}/issue`),

  cancel: (id: number) =>
    api.patch<ApiResponse<MaterialRequest>>(`/requests/${id}/cancel`),
};
