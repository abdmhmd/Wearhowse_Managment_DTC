import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type ProjectsFilter, type CreateProjectPayload } from '@/api/projects.api';
import type { ProjectStudent } from '@/types';
import { showSuccess, showError } from '@/utils/toast';
import { getErrorMessage } from '@/utils/error';

export function useProjects(page = 1, limit = 20, filter?: ProjectsFilter) {
  return useQuery({
    queryKey: ['projects', page, limit, filter],
    queryFn: async () => {
      const res = await projectsApi.getAll(page, limit, filter);
      return res.data.data;
    },
  });
}

export function useAllProjects() {
  return useQuery({
    queryKey: ['projects', 'all'],
    queryFn: async () => {
      const res = await projectsApi.getAll(1, 200);
      return res.data.data;
    },
  });
}

export function useProjectDetail(id: number | null) {
  return useQuery({
    queryKey: ['projects', 'detail', id],
    enabled: id != null,
    queryFn: async () => {
      const res = await projectsApi.getDetail(id!);
      return res.data.data;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectPayload) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showSuccess('Project created successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to create project'));
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateProjectPayload> }) =>
      projectsApi.update(id, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'detail', vars.id] });
      showSuccess('Project updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update project'));
    },
  });
}

export function useCloseProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.close(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'detail', id] });
      showSuccess('Project closed successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to close project'));
    },
  });
}

export function useCancelProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.cancel(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'detail', id] });
      showSuccess('Project cancelled successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to cancel project'));
    },
  });
}

export function useSetStudents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, students }: { id: number; students: ProjectStudent[] }) =>
      projectsApi.setStudents(id, students),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'detail', vars.id] });
      showSuccess('Project students updated successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to update project students'));
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showSuccess('Project deleted successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to delete project'));
    },
  });
}
