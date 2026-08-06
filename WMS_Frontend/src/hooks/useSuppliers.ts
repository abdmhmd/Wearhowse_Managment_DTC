import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { suppliersApi } from '@/api/suppliers.api';
import type { CreateSupplierFormData, UpdateSupplierFormData } from '@/schemas/suppliers.schema';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useSuppliers(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['suppliers', page, limit],
    queryFn: async () => {
      const res = await suppliersApi.getAll(page, limit);
      return res.data.data;
    },
  });
}

export function useAllSuppliers() {
  return useQuery({
    queryKey: ['suppliers', 'all'],
    queryFn: async () => {
      const res = await suppliersApi.getAll(1, 200);
      return res.data.data;
    },
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSupplierFormData) => suppliersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      showSuccess('Supplier created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create supplier'));
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSupplierFormData }) =>
      suppliersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      showSuccess('Supplier updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update supplier'));
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => suppliersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      showSuccess('Supplier deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete supplier'));
    },
  });
}
