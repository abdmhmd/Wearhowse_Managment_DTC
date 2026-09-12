import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseRequestsApi, type CreatePurchaseRequestPayload } from '@/api/purchaseRequests.api';
import { invalidatePurchaseRequests } from '@/hooks/usePurchaseRequests';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePurchaseRequestPayload) => purchaseRequestsApi.create(data),
    onSuccess: () => invalidatePurchaseRequests(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to create purchase request')),
  });
}