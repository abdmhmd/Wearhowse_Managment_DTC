import { runInTransaction } from '../../config/database';
import { projectsRepository, ProjectStatus } from './projects.repository';
import { custodiesRepository } from '../custodies/custodies.repository';
import { NotFoundError, ValidationError, AppError } from '../../utils/AppError';
import { PaginationMeta } from '../../utils/response';

export class ProjectsService {
  async create(
    createdBy: number,
    data: { name: string; department_id: number; supervisor_id: number; notes?: string }
  ) {
    return runInTransaction(async (client) => {
      const project_no = await projectsRepository.generateProjectNo();
      const project = await projectsRepository.create(
        { project_no, name: data.name, department_id: data.department_id, supervisor_id: data.supervisor_id, created_by: createdBy, notes: data.notes ?? null },
        client
      );
      return project;
    });
  }

  async getAll(filters: {
    status?: ProjectStatus;
    department_id?: number;
    supervisor_id?: number;
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const { items, total } = await projectsRepository.findAll({
      status: filters.status,
      department_id: filters.department_id,
      supervisor_id: filters.supervisor_id,
      limit,
      offset,
    });

    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number) {
    const project = await projectsRepository.findById(id);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    return project;
  }

  async update(id: number, data: { name?: string; supervisor_id?: number; notes?: string | null }) {
    const project = await projectsRepository.update(id, data);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    return project;
  }

  async close(id: number, closedBy: number) {
    return runInTransaction(async (client) => {
      const project = await projectsRepository.findById(id);
      if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });

      if (project.status === 'closed') {
        throw new ValidationError('Project is already closed', { id });
      }

      const activeCustodies = await custodiesRepository.countActiveCustodiesByProject(id);
      if (activeCustodies > 0) {
        throw new ValidationError(
          `Cannot close project with ${activeCustodies} active custody record(s). Return all durable items first.`,
          { active_custodies: activeCustodies }
        );
      }

      return projectsRepository.close(id, closedBy, client);
    });
  }

  async remove(id: number) {
    const project = await projectsRepository.deactivate(id);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    return { message: 'Project deleted successfully' };
  }
}

export const projectsService = new ProjectsService();
