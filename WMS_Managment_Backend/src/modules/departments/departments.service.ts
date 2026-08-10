import { departmentsRepository } from './departments.repository';
import { PaginationMeta } from '../../utils/response';
import type { AuthUserContext } from '../authorization/authorization.service';

export class DepartmentsService {
  async getAll(page = 1, limit = 20, user?: AuthUserContext): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      departmentsRepository.findAll(limit, offset, user),
      departmentsRepository.countAll(user),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getByCode(code: string, user?: AuthUserContext) {
    return departmentsRepository.findByCode(code, user);
  }

  async create(data: { code: string; name_ar: string }) {
    return departmentsRepository.create(data);
  }

  async update(code: string, data: { name_ar?: string }) {
    return departmentsRepository.update(code, data);
  }

  async delete(code: string) {
    return departmentsRepository.delete(code);
  }
}
export const departmentsService = new DepartmentsService();
