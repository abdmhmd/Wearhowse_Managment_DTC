import api from './client';
import type { ApiResponse, PaginatedResponse, User } from '@/types';

export const usersApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<User>>('/users', { params: { page, limit } }),

  getById: (id: number) =>
    api.get<ApiResponse<User>>(`/users/${id}`),

  create: (data: { username: string; password: string; full_name: string; role: string }) =>
    api.post<ApiResponse<User>>('/users', data),

  update: (id: number, data: { username?: string; password?: string; full_name?: string; role?: string; is_active?: boolean }) =>
    api.put<ApiResponse<User>>(`/users/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<User>>(`/users/${id}`),
};
