import api from './client';
import type { ApiResponse, InventoryReportItem, PaginatedResponse } from '@/types';

export interface InventoryReportFilters {
  warehouse_id?: number;
  category_code?: string;
  is_active?: string;
  low_stock?: string;
  overstock?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const reportsApi = {
  getInventoryReport: (filters: InventoryReportFilters) =>
    api.get<PaginatedResponse<InventoryReportItem>>('/reports/inventory', { params: filters }),

  getItemCard: (id: number) =>
    api.get<ApiResponse<InventoryReportItem>>(`/reports/item-card/${id}`),
};
