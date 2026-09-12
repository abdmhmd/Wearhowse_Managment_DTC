import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseRequestsApi } from '@/api/purchaseRequests.api';
import { invalidatePurchaseRequests } from '@/hooks/usePurchaseRequests';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useApproveDept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => purchaseRequestsApi.approveDept(id),
    onSuccess: () => invalidatePurchaseRequests(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to approve purchase request')),
  });
}