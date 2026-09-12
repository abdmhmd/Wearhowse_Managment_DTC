import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseRequestsApi } from '@/api/purchaseRequests.api';
import { invalidatePurchaseRequests } from '@/hooks/usePurchaseRequests';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useRejectAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => purchaseRequestsApi.rejectAdmin(id, reason),
    onSuccess: () => invalidatePurchaseRequests(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to reject purchase request')),
  });
}