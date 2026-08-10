import { runInTransaction, pool } from '../../config/database';
import { projectsRepository, ProjectStatus, ProjectStudent } from './projects.repository';
import { custodiesRepository } from '../custodies/custodies.repository';
import { warehousesRepository } from '../warehouses/warehouses.repository';
import { NotFoundError, ValidationError, AppError } from '../../utils/AppError';
import { PaginationMeta } from '../../utils/response';
import { scopeForUser, type DataScope } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export class ProjectsService {
  async create(
    createdBy: number,
    data: {
      name: string;
      department_id: number;
      supervisor_id: number;
      warehouse_id?: number;
      academic_year?: string | null;
      description?: string | null;
      start_date?: string | null;
      expected_completion_date?: string | null;
      notes?: string | null;
      students?: ProjectStudent[];
    },
    user?: AuthUserContext
  ) {
    return runInTransaction(async (client) => {
      const warehouse_id = await this.resolveAndValidateWarehouse(
        data.department_id,
        data.warehouse_id,
        user
      );

      const project_no = await projectsRepository.generateProjectNo();
      const project = await projectsRepository.create(
        {
          project_no,
          name: data.name,
          department_id: data.department_id,
          warehouse_id,
          supervisor_id: data.supervisor_id,
          created_by: createdBy,
          academic_year: data.academic_year ?? null,
          description: data.description ?? null,
          start_date: data.start_date ? new Date(data.start_date) : null,
          expected_completion_date: data.expected_completion_date
            ? new Date(data.expected_completion_date)
            : null,
          notes: data.notes ?? null,
        },
        client
      );

      if (data.students?.length) {
        await projectsRepository.setStudents(client, project.id, data.students);
      }

      return project;
    });
  }

  async getAll(filters: {
    status?: ProjectStatus;
    department_id?: number;
    warehouse_id?: number;
    supervisor_id?: number;
    academic_year?: string;
    search?: string;
    page?: number;
    limit?: number;
    user?: AuthUserContext;
  }): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const { items, total } = await projectsRepository.findAll({
      status: filters.status,
      department_id: filters.department_id,
      warehouse_id: filters.warehouse_id,
      supervisor_id: filters.supervisor_id,
      academic_year: filters.academic_year,
      search: filters.search,
      user: filters.user,
      limit,
      offset,
    });

    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async inScope(project: { department_id: number }, user: AuthUserContext): Promise<boolean> {
    const scope: DataScope = scopeForUser(user);
    if (scope === 'GLOBAL') return true;
    if (scope === 'DEPARTMENT') return project.department_id === user.department_id;
    if (scope === 'WAREHOUSE') {
      // A warehouse manager sees projects of the departments that own their
      // assigned warehouses (a main warehouse is bound to its department).
      if (user.warehouse_ids.length === 0) return false;
      const res = await pool.query(
        `SELECT 1 FROM warehouses
          WHERE id = ANY($1) AND department_id = $2 AND is_active = true
          LIMIT 1`,
        [user.warehouse_ids, project.department_id]
      );
      return res.rows.length > 0;
    }
    return false;
  }

  /**
   * Resolves the warehouse for a project.
   *
   * - When `warehouse_id` is omitted, defaults to the department's main
   *   warehouse, then its first active warehouse (backwards compatible with
   *   callers that only pass department_id).
   * - The project's warehouse MUST belong to the project's department (the
   *   backend enforces this — never rely on frontend filtering).
   * - warehouse_managers can only create projects for warehouses they are
   *   assigned to.
   */
  private async resolveAndValidateWarehouse(
    departmentId: number,
    warehouseId?: number,
    user?: AuthUserContext
  ): Promise<number> {
    let id = warehouseId;
    if (!id) {
      const main = await warehousesRepository.findMainByDepartment(departmentId);
      if (main) id = main.id;
    }
    if (!id) {
      const fallback = await warehousesRepository.findFirstActiveByDepartment(departmentId);
      if (fallback) id = fallback.id;
    }
    if (!id) {
      throw new ValidationError(
        'No warehouse found for this department. Assign a warehouse to the department before creating a project.'
      );
    }

    const warehouse = await warehousesRepository.findById(id);
    if (!warehouse) {
      throw new ValidationError('The selected warehouse does not exist or is inactive.', { warehouse_id: id });
    }
    if (warehouse.department_id !== departmentId) {
      throw new ValidationError('The project warehouse must belong to the project department.', {
        warehouse_id: id,
        department_id: departmentId,
      });
    }

    if (user && scopeForUser(user) === 'WAREHOUSE' && !user.warehouse_ids.includes(id)) {
      throw new ValidationError('You can only create projects for a warehouse you are assigned to.', {
        warehouse_id: id,
      });
    }
    return id;
  }

  async getById(id: number, user?: AuthUserContext) {
    const project = await projectsRepository.findById(id);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    if (user && !(await this.inScope(project, user))) {
      throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    }
    return project;
  }

  /** Full project detail: base row + student roster + borrowed materials. */
  async getDetail(id: number, user?: AuthUserContext) {
    const project = await this.getById(id, user);
    const [students, materials] = await Promise.all([
      projectsRepository.findStudents(id),
      projectsRepository.findProjectMaterials(id),
    ]);
    return { ...project, students, materials };
  }

  async update(
    id: number,
    data: {
      name?: string;
      warehouse_id?: number;
      supervisor_id?: number;
      academic_year?: string | null;
      description?: string | null;
      start_date?: string | null;
      expected_completion_date?: string | null;
      notes?: string | null;
    },
    user?: AuthUserContext
  ) {
    let project = await projectsRepository.findById(id);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    if (user && !(await this.inScope(project, user))) {
      throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    }

    const updateData: any = { ...data };
    if (data.warehouse_id !== undefined && data.warehouse_id !== project.warehouse_id) {
      const resolved = await this.resolveAndValidateWarehouse(project.department_id, data.warehouse_id, user);
      updateData.warehouse_id = resolved;
    } else {
      delete updateData.warehouse_id;
    }

    project = await projectsRepository.update(id, updateData);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    return project;
  }

  async close(id: number, closedBy: number, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      const project = await projectsRepository.findById(id);
      if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
      if (user && !(await this.inScope(project, user))) {
        throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
      }

      if (project.status === 'closed') {
        throw new ValidationError('Project is already closed', { id });
      }
      if (project.status === 'cancelled') {
        throw new ValidationError('A cancelled project cannot be closed', { id });
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

  async cancel(id: number, cancelledBy: number, user?: AuthUserContext) {
    return runInTransaction(async (client) => {
      const project = await projectsRepository.findById(id);
      if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
      if (user && !(await this.inScope(project, user))) {
        throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
      }

      if (project.status !== 'open') {
        throw new ValidationError('Only an open project can be cancelled', { id, status: project.status });
      }

      return projectsRepository.cancel(id, cancelledBy, client);
    });
  }

  /** Replaces the project's free-text student roster. */
  async setStudents(id: number, students: ProjectStudent[], user?: AuthUserContext) {
    const project = await projectsRepository.findById(id);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    if (user && !(await this.inScope(project, user))) {
      throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    }
    return runInTransaction(async (client) => {
      await projectsRepository.setStudents(client, id, students);
      return projectsRepository.findStudents(id);
    });
  }

  async remove(id: number, user?: AuthUserContext) {
    if (user) {
      const project = await projectsRepository.findById(id);
      if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
      if (!(await this.inScope(project, user))) {
        throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
      }
    }
    const project = await projectsRepository.deactivate(id);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    return { message: 'Project deleted successfully' };
  }
}

export const projectsService = new ProjectsService();
