import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  purchaseOrdersApi,
  type PurchaseOrdersFilter,
  type CreatePurchaseOrderPayload,
  type ReceiveLinePayload,
} from '@/api/purchase-orders.api';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function usePurchaseOrders(page = 1, limit = 20, filter?: PurchaseOrdersFilter, enabled = true) {
  return useQuery({
    queryKey: ['purchase-orders', page, limit, filter],
    queryFn: async () => {
      const res = await purchaseOrdersApi.getAll(page, limit, filter);
      return res.data.data;
    },
    enabled,
  });
}

export function usePurchaseOrder(id: number | undefined) {
  return useQuery({
    queryKey: ['purchase-orders', 'detail', id],
    queryFn: async () => {
      const res = await purchaseOrdersApi.getById(id!);
      return res.data.data;
    },
    enabled: id != null,
  });
}

function invalidatePos(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  queryClient.invalidateQueries({ queryKey: ['items'] });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePurchaseOrderPayload) => purchaseOrdersApi.create(data),
    onSuccess: () => invalidatePos(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to create purchase order')),
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePurchaseOrderPayload> }) =>
      purchaseOrdersApi.update(id, data),
    onSuccess: () => invalidatePos(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to update purchase order')),
  });
}

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => purchaseOrdersApi.approve(id),
    onSuccess: () => invalidatePos(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to approve purchase order')),
  });
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => purchaseOrdersApi.cancel(id),
    onSuccess: () => invalidatePos(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to cancel purchase order')),
  });
}

export function useClosePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => purchaseOrdersApi.close(id),
    onSuccess: () => invalidatePos(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to close purchase order')),
  });
}

export function useReceivePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lines }: { id: number; lines: ReceiveLinePayload[] }) =>
      purchaseOrdersApi.receive(id, lines),
    onSuccess: (data) => {
      invalidatePos(queryClient);
      const txnNo = data.data?.data?.transaction_no;
      showSuccess(txnNo ? `RV #${txnNo}` : 'Received');
    },
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to receive stock')),
  });
}

export function useAllocateStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, detail_id, dest_warehouse_id, quantity }: { id: number; detail_id: number; dest_warehouse_id: number; quantity: number }) =>
      purchaseOrdersApi.allocate(id, { detail_id, dest_warehouse_id, quantity }),
    onSuccess: () => invalidatePos(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to allocate stock')),
  });
}

export function useTransferAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ allocationId, quantity }: { allocationId: number; quantity: number }) =>
      purchaseOrdersApi.transfer(allocationId, quantity),
    onSuccess: () => invalidatePos(queryClient),
    onError: (error: Error) => showError(getErrorMessage(error, 'Failed to transfer stock')),
  });
}
