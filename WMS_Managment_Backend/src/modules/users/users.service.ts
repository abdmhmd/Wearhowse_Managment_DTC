import { usersRepository } from './users.repository';
import { pool } from '../../config/database';
import { PaginationMeta } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';

interface User {
  username: string; password_hash: string; full_name: string;
  role: 'system_admin' | 'warehouse_manager' | 'storekeeper' | 'accountant' | 'department_manager' | 'viewer';
  department_id?: number | null;
}

export class UsersService {
  async getAll(page = 1, limit = 20): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      usersRepository.findAll(limit, offset),
      usersRepository.countAll(),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number) {
    return usersRepository.findById(id);
  }

  async create(data: User) {
    return usersRepository.create(data);
  }

  async update(id: number, data: Partial<User> & { is_active?: boolean }) {
    // Guard: prevent disabling or demoting the last active system_admin
    if (data.is_active === false || (data.role && data.role !== 'system_admin')) {
      const currentRes = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
      const current = currentRes.rows[0];
      if (current?.role === 'system_admin') {
        const countRes = await pool.query(
          "SELECT COUNT(*)::int AS total FROM users WHERE role = 'system_admin' AND is_active = true"
        );
        if (countRes.rows[0].total <= 1) {
          throw new ValidationError(
            'Cannot disable or demote the last active system administrator',
            { user_id: id }
          );
        }
      }
    }
    return usersRepository.update(id, data);
  }

  async delete(id: number) {
    // Guard: prevent deleting the last active system_admin
    const currentRes = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    const current = currentRes.rows[0];
    if (current?.role === 'system_admin') {
      const countRes = await pool.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'system_admin' AND is_active = true"
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
}
export const usersService = new UsersService();

