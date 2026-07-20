import { usersRepository } from './users.repository';
import { PaginationMeta } from '../../utils/response';

interface User {
  username: string; password_hash: string; full_name: string;
  role: 'system_admin' | 'warehouse_manager' | 'storekeeper' | 'accountant';
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

  async create(data: { username: string; password_hash: string; full_name: string; role: User['role'] }) {
    return usersRepository.create(data);
  }

  async update(id: number, data: { username?: string; password_hash?: string; full_name?: string; role?: User['role']; is_active?: boolean }) {
    return usersRepository.update(id, data);
  }

  async delete(id: number) {
    return usersRepository.delete(id);
  }
}
export const usersService = new UsersService();
