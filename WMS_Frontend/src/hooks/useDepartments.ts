import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { departmentsApi } from '@/api/departments.api';
import type { CreateDepartmentFormData, UpdateDepartmentFormData } from '@/schemas/departments.schema';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useDepartments(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['departments', page, limit],
    queryFn: async () => {
      const res = await departmentsApi.getAll(page, limit);
      return res.data.data;
    },
  });
}

export function useAllDepartments() {
  return useQuery({
    queryKey: ['departments', 'all'],
    queryFn: async () => {
      const res = await departmentsApi.getAll(1, 200);
      return res.data.data;
    },
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDepartmentFormData) => departmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      showSuccess('Department created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create department'));
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, data }: { code: string; data: UpdateDepartmentFormData }) =>
      departmentsApi.update(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      showSuccess('Department updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update department'));
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => departmentsApi.delete(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      showSuccess('Department deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete department'));
    },
  });
}
