import api from './client';
import type { ApiResponse, MaterialRequest, PaginatedResponse, RequestStatus, RequestType, Warehouse } from '@/types';

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
  items: Array<{ item_id: number; quantity: number; unit_code?: string; notes?: string }>;
}

export interface RequestCatalogItem {
  id: number;
  item_code: string;
  name_ar: string;
  name_en: string;
  unit_code: string;
  /** Authoritative base unit of the item — the request line's unit is derived from it. */
  base_unit_code: string;
  base_unit_name_ar: string | null;
  base_unit_name_en: string | null;
  category_code: string | null;
  current_balance: number;
  is_consumable: boolean;
}

export interface RequestCatalog {
  department: { id: number; name_ar: string | null; name_en: string | null } | null;
  warehouses: Warehouse[];
  items: RequestCatalogItem[];
}

export const materialRequestsApi = {
  getAll: (page = 1, limit = 20, filter?: MaterialRequestsFilter) =>
    api.get<PaginatedResponse<MaterialRequest>>('/requests', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<MaterialRequest>>(`/requests/${id}`),

  getCatalog: () =>
    api.get<ApiResponse<RequestCatalog>>('/requests/catalog'),

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
