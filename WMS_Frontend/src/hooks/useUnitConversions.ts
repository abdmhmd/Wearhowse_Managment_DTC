import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unitConversionsApi } from '@/api/unit-conversions.api';
import type { CreateUnitConversionFormData, UpdateUnitConversionFormData } from '@/schemas/unit-conversions.schema';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useUnitConversions(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['unit-conversions', page, limit],
    queryFn: async () => {
      const res = await unitConversionsApi.getAll(page, limit);
      return res.data;
    },
  });
}

export function useUnitConversionsByItem(itemId: number) {
  return useQuery({
    queryKey: ['unit-conversions', 'item', itemId],
    queryFn: async () => {
      const res = await unitConversionsApi.getByItemId(itemId);
      return res.data;
    },
    enabled: !!itemId,
  });
}

export function useCreateUnitConversion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUnitConversionFormData) => unitConversionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-conversions'] });
      showSuccess('Unit conversion created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create unit conversion'));
    },
  });
}

export function useUpdateUnitConversion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUnitConversionFormData }) =>
      unitConversionsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-conversions'] });
      showSuccess('Unit conversion updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update unit conversion'));
    },
  });
}

export function useDeleteUnitConversion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => unitConversionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit-conversions'] });
      showSuccess('Unit conversion deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete unit conversion'));
    },
  });
}
