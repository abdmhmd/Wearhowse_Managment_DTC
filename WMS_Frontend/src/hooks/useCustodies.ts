import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { custodiesApi, type CustodiesFilter } from '@/api/custodies.api';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useCustodies(page = 1, limit = 20, filter?: CustodiesFilter) {
  return useQuery({
    queryKey: ['custodies', page, limit, filter],
    queryFn: async () => {
      const res = await custodiesApi.getAll(page, limit, filter);
      return res.data;
    },
  });
}

export function useReturnCustody() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      custodiesApi.returnItem(id, notes),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['custodies'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      const txnNo = (data as any)?.data?.transaction_no;
      showSuccess(txnNo ? `Item returned successfully - RTI #${txnNo}` : 'Item returned successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to return item'));
    },
  });
}
