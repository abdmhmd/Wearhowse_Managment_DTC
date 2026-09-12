import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseRequestsApi } from '@/api/purchaseRequests.api';
import { invalidatePurchaseRequests } from '@/hooks/usePurchaseRequests';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useRejectDept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => purchaseRequestsApi.rejectDept(id, reason),
    onSuccess: () => invalidatePurchaseRequests(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to reject purchase request')),
  });
}