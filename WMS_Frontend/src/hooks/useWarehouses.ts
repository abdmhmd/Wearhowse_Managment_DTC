import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { warehousesApi } from '@/api/warehouses.api';
import type { CreateWarehouseFormData, UpdateWarehouseFormData } from '@/schemas/warehouses.schema';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useWarehouses(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['warehouses', page, limit],
    queryFn: async () => {
      const res = await warehousesApi.getAll(page, limit);
      return res.data.data;
    },
  });
}

export function useAllWarehouses() {
  return useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: async () => {
      const res = await warehousesApi.getAll(1, 200);
      return res.data.data;
    },
  });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWarehouseFormData) => warehousesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      showSuccess('Warehouse created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create warehouse'));
    },
  });
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateWarehouseFormData }) =>
      warehousesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      showSuccess('Warehouse updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update warehouse'));
    },
  });
}

export function useDeleteWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => warehousesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      showSuccess('Warehouse deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete warehouse'));
    },
  });
}
