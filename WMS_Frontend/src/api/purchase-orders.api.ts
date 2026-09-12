import api from './client';
import type { ApiResponse, PaginatedResponse, PurchaseOrder, PurchaseOrderStatus } from '@/types';

export interface PurchaseOrdersFilter {
  status?: PurchaseOrderStatus;
  supplier_name?: string;
  warehouse_id?: number;
  search?: string;
}

export interface CreatePurchaseOrderPayload {
  supplier_name?: string | null;
  /** Optional: sub_warehouse_manager omit it — the backend derives their
   *  department main warehouse server-side. admin sends it. */
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
    api.post<ApiResponse<{ message: string; transaction_id: number; transaction_no: string; status: PurchaseOrderStatus; auto_transfer_created: boolean; linked_transfer_id: number | null; linked_transfer_no: string | null }>>(
      `/purchase-orders/${id}/receive`,
      { lines }
    ),

  confirmReceive: (id: number) =>
    api.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/confirm-receive`),

  confirmTransfer: (id: number) =>
    api.post<ApiResponse<{ message: string; transfer_count: number; transaction_no: string | null }>>(
      `/purchase-orders/${id}/confirm-transfer`
    ),
};
