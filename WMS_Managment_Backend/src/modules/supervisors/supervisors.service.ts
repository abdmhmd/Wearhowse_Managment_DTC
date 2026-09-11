import { supervisorsRepository, type SupervisorRow } from './supervisors.repository';
import { pool } from '../../config/database';
import { PaginationMeta } from '../../utils/response';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError';
import type { AuthUserContext } from '../authorization/authorization.service';

export interface CreateSupervisorData {
  username: string;
  password_hash: string;
  full_name: string;
  is_active?: boolean;
  department_id?: number | null;
}

export interface UpdateSupervisorData {
  username?: string;
  password_hash?: string;
  full_name?: string;
  is_active?: boolean;
}

export class SupervisorsService {
  /**
   * List supervisors (role = supervisor), scoped to the caller:
   *   * admin      -> all departments
   *   * department_manager-> own department only (empty if the actor has no department)
   * The list deliberately INCLUDES inactive supervisors so a department head
   * can re-activate a colleague. Search matches username / full_name.
   */
  async getAll(actor: AuthUserContext, page = 1, limit = 20, search?: string) {
    // Fail-closed: a department_manager with no department can see nothing.
    if (actor.role !== 'admin' && !actor.department_id) {
      return {
        items: [],
        pagination: { page, limit, total: 0, totalPages: 0 } as PaginationMeta,
      };
    }
    const departmentId = actor.role === 'admin' ? undefined : actor.department_id;
    const filters = { departmentId, search: search?.trim() || undefined };
    const [items, total] = await Promise.all([
      supervisorsRepository.findAll(filters, limit, (page - 1) * limit),
      supervisorsRepository.countAll(filters),
    ]);
    const pagination: PaginationMeta = { page, limit, total, totalPages: Math.ceil(total / limit) };
    return { items, pagination };
  }

  async getById(actor: AuthUserContext, id: number): Promise<SupervisorRow> {
    const row = await this.findInScopeOrThrow(actor, id);
    return row;
  }

  async create(actor: AuthUserContext, data: CreateSupervisorData): Promise<SupervisorRow> {
    // A supervisor is always a user with role `supervisor` (set by the
    // repository) assigned to the caller's department.
    let departmentId: number;
    if (actor.role === 'admin') {
      if (data.department_id === undefined || data.department_id === null) {
        throw new ValidationError('department_id is required');
      }
      departmentId = data.department_id;
    } else {
      if (!actor.department_id) {
        throw new ValidationError('You cannot create supervisors without a department', {
          department_id: actor.department_id,
        });
      }
      departmentId = actor.department_id;
    }

    const existing = await supervisorsRepository.findByUsername(data.username);
    if (existing) {
      throw new ValidationError('Username already exists', { username: data.username });
    }

    return supervisorsRepository.create({
      username: data.username,
      password_hash: data.password_hash,
      full_name: data.full_name,
      department_id: departmentId,
      is_active: data.is_active ?? true,
    });
  }

  async update(actor: AuthUserContext, id: number, data: UpdateSupervisorData): Promise<SupervisorRow> {
    const row = await this.findInScopeOrThrow(actor, id);

    if (actor.role !== 'admin' && actor.userId === id && data.is_active === false) {
      throw new ForbiddenError('You cannot deactivate your own account');
    }

    if (data.username && data.username !== row.username) {
      const existing = await supervisorsRepository.findByUsername(data.username);
      if (existing && existing.id !== id) {
        throw new ValidationError('Username already exists', { username: data.username });
      }
    }

    const updated = await supervisorsRepository.update(id, data);
    if (!updated) throw new NotFoundError('Supervisor', 'SUPERVISOR_NOT_FOUND', { id });
    return updated;
  }

  async remove(actor: AuthUserContext, id: number): Promise<SupervisorRow> {
    const row = await this.findInScopeOrThrow(actor, id);

    if (actor.role !== 'admin' && actor.userId === id) {
      throw new ForbiddenError('You cannot delete your own account');
    }

    const deleted = await supervisorsRepository.delete(id);
    if (!deleted) throw new NotFoundError('Supervisor', 'SUPERVISOR_NOT_FOUND', { id });
    return deleted;
  }

  /**
   * Loads a supervisor and enforces scope BEFORE any read/update/delete. A
   * non-admin actor can only touch supervisors in their own department; any
   * out-of-scope id surfaces as 404 (never leaks whether the record exists).
   */
  private async findInScopeOrThrow(actor: AuthUserContext, id: number): Promise<SupervisorRow> {
    const row = await supervisorsRepository.findById(id);
    if (!row) throw new NotFoundError('Supervisor', 'SUPERVISOR_NOT_FOUND', { id });
    if (actor.role !== 'admin') {
      if (actor.department_id == null || row.department_id !== actor.department_id) {
        throw new NotFoundError('Supervisor', 'SUPERVISOR_NOT_FOUND', { id });
      }
    }
    return row;
  }
}

export const supervisorsService = new SupervisorsService();
