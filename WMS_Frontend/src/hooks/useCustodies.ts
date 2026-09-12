import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { custodiesApi, type CustodiesFilter, type ReturnItemPayload } from '@/api/custodies.api';
import type { CustodyCondition } from '@/types';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useCustodies(page = 1, limit = 20, filter?: CustodiesFilter) {
  return useQuery({
    queryKey: ['custodies', page, limit, filter],
    queryFn: async () => {
      const res = await custodiesApi.getAll(page, limit, filter);
      return res.data.data;
    },
  });
}

export function useReturnCustody() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload?: ReturnItemPayload }) =>
      custodiesApi.returnItem(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['custodies'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      const msg = data.data?.data?.message || 'Action completed';
      showSuccess(msg);
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to return item'));
    },
  });
}

export function useReceiveReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, condition }: { id: number; condition?: CustodyCondition }) =>
      custodiesApi.receiveReturn(id, { condition }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['custodies'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      const txnNo = data.data?.data?.transaction_no;
      const status = data.data?.data?.status;
      if (status && status !== 'returned') {
        showSuccess(status === 'damaged' || status === 'lost' ? `Received as ${status}` : 'Return confirmed');
      } else {
        showSuccess(txnNo ? `Return confirmed - RTI #${txnNo}` : 'Return confirmed');
      }
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to confirm return'));
    },
  });
}
