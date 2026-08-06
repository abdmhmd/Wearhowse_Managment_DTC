import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api/settings.api';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await settingsApi.getAll();
      return res.data.data;
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      showSuccess('Settings updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update settings'));
    },
  });
}
