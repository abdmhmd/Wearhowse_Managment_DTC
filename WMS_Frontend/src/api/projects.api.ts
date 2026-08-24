import api from './client';
import type { ApiResponse, PaginatedResponse, Project, ProjectStatus, ProjectStudent } from '@/types';

export interface ProjectsFilter {
  status?: ProjectStatus;
  department_id?: number;
  warehouse_id?: number;
  supervisor_id?: number;
  academic_year?: string;
  search?: string;
}

export interface CreateProjectPayload {
  name: string;
  department_id: number;
  warehouse_id?: number;
  supervisor_id: number;
  academic_year?: string | null;
  description?: string | null;
  notes?: string | null;
  students?: ProjectStudent[];
}

export const projectsApi = {
  getAll: (page = 1, limit = 20, filter?: ProjectsFilter) =>
    api.get<PaginatedResponse<Project>>('/projects', { params: { page, limit, ...filter } }),

  getById: (id: number) =>
    api.get<ApiResponse<Project>>(`/projects/${id}`),

  getDetail: (id: number) =>
    api.get<ApiResponse<Project>>(`/projects/${id}/detail`),

  create: (data: CreateProjectPayload) =>
    api.post<ApiResponse<Project>>('/projects', data),

  update: (id: number, data: Partial<CreateProjectPayload>) =>
    api.patch<ApiResponse<Project>>(`/projects/${id}`, data),

  close: (id: number) =>
    api.patch<ApiResponse<Project>>(`/projects/${id}/close`),

  cancel: (id: number) =>
    api.patch<ApiResponse<Project>>(`/projects/${id}/cancel`),

  setStudents: (id: number, students: ProjectStudent[]) =>
    api.put<ApiResponse<{ students: ProjectStudent[] }>>(`/projects/${id}/students`, { students }),

  remove: (id: number) =>
    api.delete<ApiResponse<Project>>(`/projects/${id}`),
};
