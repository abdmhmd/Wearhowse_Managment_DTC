import { useQuery, useQueryClient } from '@tanstack/react-query';
import { purchaseRequestsApi, type PurchaseRequestsFilter } from '@/api/purchaseRequests.api';

export function usePurchaseRequests(page = 1, limit = 20, filter?: PurchaseRequestsFilter, enabled = true) {
  return useQuery({
    queryKey: ['purchase-requests', page, limit, filter],
    queryFn: async () => {
      const res = await purchaseRequestsApi.getAll(page, limit, filter);
      return res.data.data;
    },
    enabled,
  });
}

export function invalidatePurchaseRequests(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
}

export function invalidatePurchaseRequestQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
  queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
}