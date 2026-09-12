import api from './client';
import type { ApiResponse, PaginatedResponse, PurchaseRequest, PurchaseRequestStatus } from '@/types';

export interface PurchaseRequestsFilter {
  status?: PurchaseRequestStatus;
}

export interface CreatePurchaseRequestItemPayload {
  item_id: number;
  quantity: number;
  unit_code: string;
  notes?: string | null;
}

export interface CreatePurchaseRequestPayload {
  warehouse_id: number;
  notes?: string | null;
  items: CreatePurchaseRequestItemPayload[];
}

export interface RejectPurchaseRequestPayload {
  reason: string;
}

export const purchaseRequestsApi = {
  getAll: (page = 1, limit = 20, filter?: PurchaseRequestsFilter) =>
    api.get<PaginatedResponse<PurchaseRequest>>('/purchase-requests', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<PurchaseRequest>>(`/purchase-requests/${id}`),

  create: (data: CreatePurchaseRequestPayload) =>
    api.post<ApiResponse<PurchaseRequest>>('/purchase-requests', data),

  cancel: (id: number) =>
    api.patch<ApiResponse<PurchaseRequest>>(`/purchase-requests/${id}/cancel`),

  approveDept: (id: number) =>
    api.patch<ApiResponse<PurchaseRequest>>(`/purchase-requests/${id}/approve-dept`),

  rejectDept: (id: number, reason: string) =>
    api.patch<ApiResponse<PurchaseRequest>>(`/purchase-requests/${id}/reject-dept`, { reason }),

  approveAdmin: (id: number) =>
    api.patch<ApiResponse<PurchaseRequest>>(`/purchase-requests/${id}/approve-admin`),

  rejectAdmin: (id: number, reason: string) =>
    api.patch<ApiResponse<PurchaseRequest>>(`/purchase-requests/${id}/reject-admin`, { reason }),
};