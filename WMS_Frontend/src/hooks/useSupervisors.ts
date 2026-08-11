import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supervisorsApi } from '@/api/supervisors.api';
import type { CreateSupervisorPayload, UpdateSupervisorPayload } from '@/api/supervisors.api';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useSupervisorsQuery(page = 1, limit = 20, search?: string) {
  return useQuery({
    queryKey: ['supervisors', page, limit, search ?? ''],
    queryFn: async () => {
      const res = await supervisorsApi.getAll(page, limit, search);
      return res.data.data;
    },
  });
}

export function useCreateSupervisor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSupervisorPayload) => supervisorsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      showSuccess('Supervisor created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create supervisor'));
    },
  });
}

export function useUpdateSupervisor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSupervisorPayload }) =>
      supervisorsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      showSuccess('Supervisor updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update supervisor'));
    },
  });
}

export function useDeleteSupervisor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => supervisorsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      showSuccess('Supervisor deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete supervisor'));
    },
  });
}
