import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '@/api/categories.api';
import type {
  CreateCategoryFormData,
  CreateSubcategoryFormData,
  UpdateCategoryFormData,
  UpdateSubcategoryFormData,
} from '@/schemas/categories.schema';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useCategories(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['categories', page, limit],
    queryFn: async () => {
      const res = await categoriesApi.getAll(page, limit);
      return res.data.data;
    },
  });
}

export function useCategory(code: string) {
  return useQuery({
    queryKey: ['categories', code],
    queryFn: async () => {
      const res = await categoriesApi.getByCode(code);
      return res.data.data;
    },
    enabled: !!code,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCategoryFormData) => categoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      showSuccess('Category created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create category'));
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, data }: { code: string; data: UpdateCategoryFormData }) =>
      categoriesApi.update(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      showSuccess('Category updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update category'));
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => categoriesApi.delete(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      showSuccess('Category deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete category'));
    },
  });
}

export function useSubcategories(categoryCode: string) {
  return useQuery({
    queryKey: ['categories', categoryCode, 'subcategories'],
    queryFn: async () => {
      const res = await categoriesApi.getSubcategories(categoryCode);
      return res.data.data;
    },
    enabled: !!categoryCode,
  });
}

export function useCreateSubcategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryCode, data }: { categoryCode: string; data: CreateSubcategoryFormData }) =>
      categoriesApi.createSubcategory(categoryCode, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      showSuccess('Subcategory created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create subcategory'));
    },
  });
}

export function useUpdateSubcategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSubcategoryFormData }) =>
      categoriesApi.updateSubcategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      showSuccess('Subcategory updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update subcategory'));
    },
  });
}

export function useDeleteSubcategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => categoriesApi.deleteSubcategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      showSuccess('Subcategory deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete subcategory'));
    },
  });
}
