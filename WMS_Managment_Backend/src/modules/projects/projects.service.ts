import { runInTransaction, pool } from '../../config/database';
import { projectsRepository, ProjectStatus, ProjectStudent } from './projects.repository';
import { custodiesRepository } from '../custodies/custodies.repository';
import { warehousesRepository } from '../warehouses/warehouses.repository';
import { NotFoundError, ValidationError, AppError, ForbiddenError } from '../../utils/AppError';
import { PaginationMeta } from '../../utils/response';
import { scopeForUser, type DataScope } from '../authorization/scope';
import type { AuthUserContext } from '../authorization/authorization.service';

export class ProjectsService {
  async create(
    createdBy: number,
    data: {
      name: string;
      department_id: number;
      supervisor_id?: number;
      warehouse_id?: number;
      academic_year?: string | null;
      description?: string | null;
      notes?: string | null;
      students?: ProjectStudent[];
    },
    user?: AuthUserContext
  ) {
    return runInTransaction(async (client) => {
      // A warehouse manager can only create a project for their own
      // department — the department is derived from the authenticated user,
      // never from the client-supplied payload.
      const scope = user ? scopeForUser(user) : 'GLOBAL';
      let departmentId = data.department_id;

      // ── Supervisor: creates ONLY their OWN projects ────────────────────────
      // Both the supervisor AND the department are DERIVED from the
      // authenticated user and never trusted from the payload. A forged
      // `supervisor_id` of another user is rejected outright so a hand-crafted
      // request can never create a project owned by someone else. The department
      // is derived too — otherwise a supervisor could never use the project in a
      // material request (which requires project.department_id == the
      // supervisor's department, enforced in material-requests.service.ts).
      let supervisorId = data.supervisor_id;
      if (user?.role === 'supervisor') {
        if (user.department_id == null) {
          throw new ValidationError(
            'Your account is not assigned to a department. Contact your administrator.'
          );
        }
        if (supervisorId != null && supervisorId !== user.id) {
          throw new ValidationError(
            'Supervisors can only create projects assigned to themselves.',
            { supervisor_id: supervisorId }
          );
        }
        supervisorId = user.id;
        departmentId = user.department_id;
      } else if (scope === 'WAREHOUSE') {
        // A warehouse manager can only create a project for their own
        // department — derived from the authenticated user.
        if (!user || user.department_id == null) {
          throw new ValidationError(
            'A warehouse manager must be assigned to a department before creating a project.'
          );
        }
        departmentId = user.department_id;
      }

      if (supervisorId == null) {
        throw new ValidationError('supervisor_id is required.', {});
      }

      const warehouse_id = await this.resolveAndValidateWarehouse(
        departmentId,
        data.warehouse_id,
        user
      );

      const project_no = await projectsRepository.generateProjectNo();
      const project = await projectsRepository.create(
        {
          project_no,
          name: data.name,
          department_id: departmentId,
          warehouse_id,
          supervisor_id: supervisorId,
          created_by: createdBy,
          academic_year: data.academic_year ?? null,
          description: data.description ?? null,
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

  private async inScope(project: { department_id: number; supervisor_id?: number }, user: AuthUserContext): Promise<boolean> {
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
    // A supervisor resolves to NONE scope: they may open ONLY the projects they
    // personally supervise (same rule as the list endpoint).
    if (user.role === 'supervisor') return project.supervisor_id === user.id;
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
    const scope = user ? scopeForUser(user) : 'GLOBAL';
    if (!id && scope === 'WAREHOUSE' && user && user.warehouse_ids.length > 0) {
      // Warehouse managers default to one of their assigned warehouses in the
      // department (preferring the department main warehouse when assigned) —
      // never to a warehouse they are not assigned to.
      const assigned = await this.findAssignedWarehouseForDepartment(
        user.warehouse_ids,
        departmentId
      );
      if (assigned) id = assigned;
    }
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

  /** Returns the manager's assigned warehouse for a department (prefers the main warehouse). */
  private async findAssignedWarehouseForDepartment(
    warehouseIds: number[],
    departmentId: number
  ): Promise<number | null> {
    const res = await pool.query(
      `SELECT id FROM warehouses
        WHERE id = ANY($1) AND department_id = $2 AND is_active = true
        ORDER BY is_main DESC, id ASC
        LIMIT 1`,
      [warehouseIds, departmentId]
    );
    return res.rows[0]?.id ?? null;
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
      notes?: string | null;
    },
    user?: AuthUserContext
  ) {
    let project = await projectsRepository.findById(id);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    if (user && !(await this.inScope(project, user))) {
      throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    }

    // A supervisor can never transfer their own project to another supervisor
    // (or to themselves — supervisor_id stays the authenticated user). Any
    // attempt to change it is rejected outright.
    if (user?.role === 'supervisor' && data.supervisor_id !== undefined && data.supervisor_id !== project.supervisor_id) {
      throw new ValidationError(
        'Supervisors cannot change the project supervisor.',
        { supervisor_id: data.supervisor_id }
      );
    }

    const updateData: any = { ...data };
    if (data.warehouse_id !== undefined && data.warehouse_id !== project.warehouse_id) {
      // Department managers stay view-only on the project's department/warehouse
      // assignment — their projects:update permission only covers metadata and
      // the student roster, never warehouse moves.
      if (user && scopeForUser(user) === 'DEPARTMENT') {
        throw new ForbiddenError('Department managers cannot change the project warehouse.');
      }
      const resolved = await this.resolveAndValidateWarehouse(project.department_id, data.warehouse_id, user);
      updateData.warehouse_id = resolved;
    } else {
      delete updateData.warehouse_id;
    }

    project = await projectsRepository.update(id, updateData);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    return project;
  }

  // ── [NP1] Close Report & Closure Workflow ─────────────────────────────────

  async getCloseReport(id: number, user?: AuthUserContext) {
    const project = await projectsRepository.findById(id);
    if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    if (user && !(await this.inScope(project, user))) {
      throw new NotFoundError('Project', 'PROJECT_NOT_FOUND', { id });
    }
    const report = await projectsRepository.getCloseReport(id);
    return {
      project_id: project.id,
      project_no: project.project_no,
      project_name: project.name,
      status: project.status,
      ...report,
    };
  }

  async initiateClose(id: number, initiatedBy: number, user?: AuthUserContext) {
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

      return projectsRepository.initiateClosure(id, initiatedBy, client);
    });
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
      return projectsRepository.findStudents(id, client);
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
