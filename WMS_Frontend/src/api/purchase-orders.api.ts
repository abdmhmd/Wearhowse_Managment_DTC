import api from './client';
import type { ApiResponse, PaginatedResponse, PurchaseOrder, PurchaseOrderStatus } from '@/types';

export interface PurchaseOrdersFilter {
  status?: PurchaseOrderStatus;
  supplier_id?: number;
  warehouse_id?: number;
  search?: string;
}

export interface CreatePurchaseOrderPayload {
  supplier_id?: number | null;
  /** Optional: warehouse managers omit it — the backend derives their
   *  department main warehouse server-side. system_admin sends it. */
  warehouse_id?: number;
  expected_date?: string | null;
  notes?: string | null;
  lines: Array<{
    item_id: number;
    quantity_ordered: number;
    unit_code: string;
    unit_price?: number;
    notes?: string | null;
  }>;
}

export interface ReceiveLinePayload {
  detail_id: number;
  quantity: number;
  unit_price?: number;
  batch_number?: string;
}

export const purchaseOrdersApi = {
  getAll: (page = 1, limit = 20, filter?: PurchaseOrdersFilter) =>
    api.get<PaginatedResponse<PurchaseOrder>>('/purchase-orders', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}`),

  create: (data: CreatePurchaseOrderPayload) =>
    api.post<ApiResponse<PurchaseOrder>>('/purchase-orders', data),

  update: (id: number, data: Partial<CreatePurchaseOrderPayload>) =>
    api.patch<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}`, data),

  approve: (id: number) =>
    api.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/approve`),

  cancel: (id: number) =>
    api.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/cancel`),

  close: (id: number) =>
    api.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/close`),

  receive: (id: number, lines: ReceiveLinePayload[]) =>
    api.post<ApiResponse<{ message: string; transaction_id: number; transaction_no: string; status: PurchaseOrderStatus }>>(
      `/purchase-orders/${id}/receive`,
      { lines }
    ),

  allocate: (id: number, payload: { detail_id: number; dest_warehouse_id: number; quantity: number }) =>
    api.post<ApiResponse<{ id: number }>>(`/purchase-orders/${id}/allocations`, payload),

  transfer: (allocationId: number, quantity: number) =>
    api.post<ApiResponse<{ message: string; transaction_no: string; status: string; remaining: number }>>(
      `/purchase-orders/allocations/${allocationId}/transfer`,
      { quantity }
    ),
};
