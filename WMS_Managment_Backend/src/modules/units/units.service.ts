import { unitsRepository } from './units.repository';
import { PaginationMeta } from '../../utils/response';
export class UnitsService {
  async getAll(page = 1, limit = 20): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      unitsRepository.findAll(limit, offset),
      unitsRepository.countAll(),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getByCode(code: string) {
    return unitsRepository.findByCode(code);
  }

  async create(data: { code: string; name_ar: string; name_en: string }) {
    return unitsRepository.create(data);
  }

  async update(code: string, data: { name_ar?: string; name_en?: string }) {
    return unitsRepository.update(code, data);
  }

  async delete(code: string) {
    return unitsRepository.delete(code);
  }
}
export const unitsService = new UnitsService();
