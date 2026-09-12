import { useQuery } from '@tanstack/react-query';
import { purchaseRequestsApi } from '@/api/purchaseRequests.api';

export function usePurchaseRequest(id: number | undefined) {
  return useQuery({
    queryKey: ['purchase-requests', 'detail', id],
    queryFn: async () => {
      const res = await purchaseRequestsApi.getById(id!);
      return res.data.data;
    },
    enabled: id != null,
  });
}