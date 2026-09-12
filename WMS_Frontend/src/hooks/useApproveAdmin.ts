import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseRequestsApi } from '@/api/purchaseRequests.api';
import { invalidatePurchaseRequestQueries } from '@/hooks/usePurchaseRequests';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useApproveAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => purchaseRequestsApi.approveAdmin(id),
    onSuccess: (data) => {
      // Admin approval AUTO-CREATES a draft purchase order, so both the
      // request list and the purchase-order list are now stale.
      invalidatePurchaseRequestQueries(queryClient);
      const request = data.data?.data;
      const poNo = request?.po_number;
      showSuccess(
        poNo
          ? `Purchase request approved — purchase order ${poNo} created`
          : 'Purchase request approved'
      );
    },
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to approve purchase request')),
  });
}