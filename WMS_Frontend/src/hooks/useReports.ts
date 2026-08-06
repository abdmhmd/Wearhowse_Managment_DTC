import { useQuery } from '@tanstack/react-query';
import { reportsApi, type InventoryReportFilters } from '@/api/reports.api';

export function useInventoryReport(filters: InventoryReportFilters) {
  return useQuery({
    queryKey: ['reports', 'inventory', filters],
    queryFn: async () => {
      const res = await reportsApi.getInventoryReport(filters);
      return res.data.data;
    },
  });
}
