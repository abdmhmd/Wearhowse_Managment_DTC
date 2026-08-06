import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type ProjectsFilter, type CreateProjectPayload } from '@/api/projects.api';
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showSuccess('Project closed successfully');
    },
    onError: (error: Error) => {
      showError(getErrorMessage(error, 'Failed to close project'));
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
