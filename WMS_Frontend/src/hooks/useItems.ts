import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { itemsApi, type ItemsFilter } from '@/api/items.api';
import type { CreateItemFormData, UpdateItemFormData } from '@/schemas/items.schema';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useItems(page = 1, limit = 20, filter?: ItemsFilter) {
  return useQuery({
    queryKey: ['items', page, limit, filter],
    queryFn: async () => {
      const res = await itemsApi.getAll(page, limit, filter);
      return res.data.data;
    },
  });
}

export function useItem(id: number) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: async () => {
      const res = await itemsApi.getById(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useAllItems(enabled = true) {
  return useQuery({
    queryKey: ['items', 'all'],
    queryFn: async () => {
      const res = await itemsApi.getAll(1, 500);
      return res.data.data;
    },
    enabled,
  });
}

export function useGenerateItemCode(categoryCode: string) {
  return useQuery({
    queryKey: ['items', 'generate-code', categoryCode],
    queryFn: async () => {
      const res = await itemsApi.generateCode(categoryCode);
      return res.data?.data?.item_code || '';
    },
    enabled: !!categoryCode,
  });
}

export function useItemCard(id: number) {
  return useQuery({
    queryKey: ['items', id, 'card'],
    queryFn: async () => {
      const res = await itemsApi.getCard(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemFormData) => itemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      showSuccess('Item created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create item'));
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateItemFormData }) =>
      itemsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      showSuccess('Item updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update item'));
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => itemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      showSuccess('Item deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete item'));
    },
  });
}
