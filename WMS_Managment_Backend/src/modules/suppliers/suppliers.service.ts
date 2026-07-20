import { suppliersRepository } from './suppliers.repository';
import { PaginationMeta } from '../../utils/response';
export class SuppliersService {
  async getAll(page = 1, limit = 20): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      suppliersRepository.findAll(limit, offset),
      suppliersRepository.countAll(),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number) {
    return suppliersRepository.findById(id);
  }

  async create(data: { name_ar: string; phone?: string; email?: string; address?: string }) {
    return suppliersRepository.create(data);
  }

  async update(id: number, data: { name_ar?: string; phone?: string; email?: string; address?: string }) {
    return suppliersRepository.update(id, data);
  }

  async delete(id: number) {
    return suppliersRepository.delete(id);
  }
}
export const suppliersService = new SuppliersService();
