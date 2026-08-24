import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unitsApi } from '@/api/units.api';
import type { CreateUnitFormData, UpdateUnitFormData } from '@/schemas/units.schema';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useUnits(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['units', page, limit],
    queryFn: async () => {
      const res = await unitsApi.getAll(page, limit);
      return res.data.data;
    },
  });
}

export function useUnit(code: string) {
  return useQuery({
    queryKey: ['units', code],
    queryFn: async () => {
      const res = await unitsApi.getByCode(code);
      return res.data.data;
    },
    enabled: !!code,
  });
}

export function useAllUnits(enabled = true) {
  return useQuery({
    queryKey: ['units', 'all'],
    queryFn: async () => {
      const res = await unitsApi.getAll(1, 200);
      return res.data.data;
    },
    enabled,
  });
}

export function useCreateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUnitFormData) => unitsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      showSuccess('Unit created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create unit'));
    },
  });
}

export function useUpdateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, data }: { code: string; data: UpdateUnitFormData }) =>
      unitsApi.update(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      showSuccess('Unit updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update unit'));
    },
  });
}

export function useDeleteUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => unitsApi.delete(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      showSuccess('Unit deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete unit'));
    },
  });
}
