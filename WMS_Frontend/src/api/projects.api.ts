import api from './client';
import type { ApiResponse, PaginatedResponse, Project, ProjectStatus } from '@/types';

export interface ProjectsFilter {
  status?: ProjectStatus;
  department_id?: number;
  supervisor_id?: number;
}

export interface CreateProjectPayload {
  name: string;
  department_id: number;
  supervisor_id: number;
  notes?: string;
}

export const projectsApi = {
  getAll: (page = 1, limit = 20, filter?: ProjectsFilter) =>
    api.get<PaginatedResponse<Project>>('/projects', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<Project>>(`/projects/${id}`),

  create: (data: CreateProjectPayload) =>
    api.post<ApiResponse<Project>>('/projects', data),

  update: (id: number, data: Partial<CreateProjectPayload>) =>
    api.patch<ApiResponse<Project>>(`/projects/${id}`, data),

  close: (id: number) =>
    api.patch<ApiResponse<Project>>(`/projects/${id}/close`),

  remove: (id: number) =>
    api.delete<ApiResponse<Project>>(`/projects/${id}`),
};
