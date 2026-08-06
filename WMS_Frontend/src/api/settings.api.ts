import api from './client';
import type { ApiResponse } from '@/types';

export const settingsApi = {
  getAll: () =>
    api.get<ApiResponse<Record<string, string>>>('/settings'),

  update: (data: Record<string, string>) =>
    api.put<ApiResponse<Record<string, string>>>('/settings', data),
};
