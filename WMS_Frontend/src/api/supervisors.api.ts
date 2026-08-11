import api from './client';
import type { ApiResponse, PaginatedResponse, Supervisor } from '@/types';

export interface CreateSupervisorPayload {
  username: string;
  password: string;
  full_name: string;
  is_active?: boolean;
  department_id?: number | null;
}

export interface UpdateSupervisorPayload {
  username?: string;
  password?: string;
  full_name?: string;
  is_active?: boolean;
}

export const supervisorsApi = {
  getAll: (page = 1, limit = 20, search?: string) =>
    api.get<PaginatedResponse<Supervisor>>('/supervisors', {
      params: { page, limit, ...(search ? { search } : {}) },
    }),

  getById: (id: number) =>
    api.get<ApiResponse<Supervisor>>(`/supervisors/${id}`),

  create: (data: CreateSupervisorPayload) =>
    api.post<ApiResponse<Supervisor>>('/supervisors', data),

  update: (id: number, data: UpdateSupervisorPayload) =>
    api.patch<ApiResponse<Supervisor>>(`/supervisors/${id}`, data),

  delete: (id: number) =>
    api.delete<ApiResponse<Supervisor>>(`/supervisors/${id}`),
};
