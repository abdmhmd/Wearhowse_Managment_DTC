import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { materialRequestsApi, type MaterialRequestsFilter, type CreateMaterialRequestPayload } from '@/api/material-requests.api';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useMaterialRequests(page = 1, limit = 20, filter?: MaterialRequestsFilter) {
  return useQuery({
    queryKey: ['material-requests', page, limit, filter],
    queryFn: async () => {
      const res = await materialRequestsApi.getAll(page, limit, filter);
      return res.data.data;
    },
  });
}

export function useMaterialRequest(id: number) {
  return useQuery({
    queryKey: ['material-requests', id],
    queryFn: async () => {
      const res = await materialRequestsApi.getById(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateMaterialRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMaterialRequestPayload) => materialRequestsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      showSuccess('Request created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create request'));
    },
  });
}

export function useApproveMaterialRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => materialRequestsApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      showSuccess('Request approved');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to approve request'));
    },
  });
}

export function useForwardMaterialRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => materialRequestsApi.forward(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      showSuccess('Request forwarded to warehouse admin');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to forward request'));
    },
  });
}

export function useRejectMaterialRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      materialRequestsApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      showSuccess('Request rejected');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to reject request'));
    },
  });
}

export function useIssueMaterialRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => materialRequestsApi.issue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['custodies'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      showSuccess('Request issued successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to issue request'));
    },
  });
}

export function useCancelMaterialRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => materialRequestsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      showSuccess('Request cancelled');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to cancel request'));
    },
  });
}
