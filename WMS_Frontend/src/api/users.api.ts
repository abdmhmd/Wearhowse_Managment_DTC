import api from './client';
import type { ApiResponse, PaginatedResponse, User } from '@/types';

export interface CreateUserPayload {
  username: string;
  password: string;
  full_name: string;
  role: string;
  department_id?: number | null;
  warehouse_ids?: number[];
}

export interface UpdateUserPayload {
  username?: string;
  password?: string;
  full_name?: string;
  role?: string;
  is_active?: boolean;
  department_id?: number | null;
  warehouse_ids?: number[];
}

export const usersApi = {
  getAll: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<User>>('/users', { params: { page, limit } }),

  getById: (id: number) =>
    api.get<ApiResponse<User>>(`/users/${id}`),

  getSupervisors: () =>
    api.get<ApiResponse<User[]>>('/users/supervisors'),

  create: (data: CreateUserPayload) =>
    api.post<ApiResponse<User>>('/users', data),

  update: (id: number, data: UpdateUserPayload) =>
    api.put<ApiResponse<User>>(`/users/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<User>>(`/users/${id}`),
};
