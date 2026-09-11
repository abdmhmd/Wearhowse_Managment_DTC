import { usersRepository } from './users.repository';
import { pool } from '../../config/database';
import { PaginationMeta } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import type { AuthUserContext } from '../authorization/authorization.service';

interface User {
  username: string; password_hash: string; full_name: string;
  role: 'admin' | 'sub_warehouse_manager' | 'department_manager' | 'supervisor';
  department_id?: number | null;
  warehouse_ids?: number[];
}

export class UsersService {
  async getAll(page = 1, limit = 20): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      usersRepository.findAll(limit, offset),
      usersRepository.countAll(),
    ]);
    const warehouseMap = await usersRepository.getWarehouseAssignmentsMap(items.map((i) => i.id));
    const enriched = items.map((i) => ({ ...i, warehouse_ids: warehouseMap.get(i.id) || [] }));
    return { items: enriched, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number) {
    const user = await usersRepository.findById(id);
    if (!user) return user;
    const warehouse_ids = await usersRepository.getWarehouseAssignments(id);
    return { ...user, warehouse_ids };
  }

  async create(data: User) {
    // Service-level enforcement (defense in depth): a sub_warehouse_manager MUST
    // be assigned to at least one warehouse, otherwise their data scope would
    // silently resolve to NONE and they could see nothing.
    if (data.role === 'sub_warehouse_manager' && (!data.warehouse_ids || data.warehouse_ids.length === 0)) {
      throw new ValidationError('sub_warehouse_manager must be assigned at least one warehouse', { role: data.role });
    }
    await this.validateDepartment(data.department_id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, department_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, full_name, role, department_id, is_active, token_version, created_at, updated_at`,
        [data.username, data.password_hash, data.full_name, data.role, data.department_id ?? null]
      );
      const user = result.rows[0];
      if (data.warehouse_ids && data.warehouse_ids.length > 0) {
        for (const warehouseId of data.warehouse_ids) {
          await client.query(
            'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [user.id, warehouseId]
          );
        }
      }
      await client.query('COMMIT');
      const warehouse_ids = data.warehouse_ids || [];
      return { ...user, warehouse_ids };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: number, data: Partial<User> & { is_active?: boolean }) {
    // Guard: prevent disabling or demoting the last active admin
    if (data.is_active === false || (data.role && data.role !== 'admin')) {
      const currentRes = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
      const current = currentRes.rows[0];
      if (current?.role === 'admin') {
        const countRes = await pool.query(
          "SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin' AND is_active = true"
        );
        if (countRes.rows[0].total <= 1) {
          throw new ValidationError(
            'Cannot disable or demote the last active system administrator',
            { user_id: id }
          );
        }
      }
    }

    const { warehouse_ids, ...restData } = data;
    await this.validateDepartment((restData as any).department_id);

    // Service-level enforcement: a sub_warehouse_manager must keep at least one
    // warehouse assignment. Checked against the FINAL state of the user (the
    // update may be changing either the role or the assignments).
    {
      const finalRole = (restData as any).role ?? await pool
        .query('SELECT role FROM users WHERE id = $1', [id])
        .then((r) => r.rows[0]?.role);
      const finalAssignments = warehouse_ids !== undefined
        ? warehouse_ids
        : await usersRepository.getWarehouseAssignments(id);
      if (finalRole === 'sub_warehouse_manager' && finalAssignments.length === 0) {
        throw new ValidationError('sub_warehouse_manager must be assigned at least one warehouse', { user_id: id });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let user: any = null;
      const restKeys = Object.keys(restData);
      if (restKeys.length > 0) {
        const result = await client.query(
          `UPDATE users
              SET ${restKeys.map((key, i) => `"${key}" = $${i + 2}`).join(', ')}
            WHERE id = $1
            RETURNING id, username, full_name, role, department_id, is_active, token_version, created_at, updated_at`,
          [id, ...restKeys.map((k) => (restData as any)[k])]
        );
        user = result.rows[0];
        if (!user) {
          await client.query('ROLLBACK');
          return null;
        }
      } else {
        const current = await client.query(
          'SELECT id, username, full_name, role, department_id, is_active, token_version, created_at, updated_at FROM users WHERE id = $1',
          [id]
        );
        user = current.rows[0];
        if (!user) {
          await client.query('ROLLBACK');
          return null;
        }
      }

      if (warehouse_ids !== undefined) {
        await client.query('DELETE FROM user_warehouses WHERE user_id = $1', [id]);
        for (const warehouseId of warehouse_ids) {
          await client.query(
            'INSERT INTO user_warehouses (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [id, warehouseId]
          );
        }
      }

      // Session revocation: role, is_active, or password changes invalidate tokens.
      const revokingKeys = Object.keys(restData).filter((k) =>
        ['role', 'is_active', 'password_hash'].includes(k)
      );
      if (revokingKeys.length > 0) {
        await client.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
      }

      await client.query('COMMIT');

      const warehouse_ids_result = warehouse_ids !== undefined
        ? warehouse_ids
        : await usersRepository.getWarehouseAssignments(id);
      return { ...user, warehouse_ids: warehouse_ids_result };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: number, actorId?: number) {
    // Guard: prevent an administrator from deleting their own active session.
    if (actorId !== undefined && id === actorId) {
      throw new ValidationError('You cannot delete your own account.', { user_id: id });
    }
    // Guard: prevent deleting the last active admin
    const currentRes = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    const current = currentRes.rows[0];
    if (current?.role === 'admin') {
      const countRes = await pool.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin' AND is_active = true"
      );
      if (countRes.rows[0].total <= 1) {
        throw new ValidationError(
          'Cannot delete the last active system administrator',
          { user_id: id }
        );
      }
    }
    return usersRepository.delete(id);
  }

  /**
   * Validates that a selected department exists and is active. Runs on both
   * create and update whenever a department_id is provided — an unknown or
   * inactive department is rejected with a clean 400 instead of a raw
   * foreign-key failure from the database.
   */
  private async validateDepartment(departmentId: number | null | undefined): Promise<void> {
    if (departmentId == null) return;
    const res = await pool.query(
      'SELECT id FROM departments WHERE id = $1 AND is_active = true',
      [departmentId]
    );
    if (res.rows.length === 0) {
      throw new ValidationError('The selected department does not exist or is inactive.', {
        department_id: departmentId,
      });
    }
  }

  /**
   * Supervisors for the project create/edit form, scoped to the caller.
   *
   *   * sub_warehouse_manager -> only supervisors in THEIR OWN department; a manager
   *     with no department_id gets an empty list (fail-closed).
   *   * admin      -> all supervisors (GLOBAL, unchanged).
   * Other roles never reach this endpoint (route is guarded by
   * `projects:supervisors`).
   */
  async getSupervisors(actor?: AuthUserContext) {
    if (actor?.role === 'sub_warehouse_manager') {
      if (!actor.department_id) return [];
      return usersRepository.findSupervisors(actor.department_id);
    }
    return usersRepository.findSupervisors();
  }
}
export const usersService = new UsersService();
