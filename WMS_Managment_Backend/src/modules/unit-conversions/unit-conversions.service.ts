import { unitConversionsRepository } from './unit-conversions.repository';
import { PaginationMeta } from '../../utils/response';
export class UnitConversionsService {
  async getAll(page = 1, limit = 20): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      unitConversionsRepository.findAll(limit, offset),
      unitConversionsRepository.countAll(),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getByItemId(item_id: number) {
    return unitConversionsRepository.findByItemId(item_id);
  }

  async create(data: { item_id: number; from_unit_code: string; to_unit_code: string; factor: number }) {
    return unitConversionsRepository.create(data);
  }

  async update(id: number, data: { from_unit_code?: string; to_unit_code?: string; factor?: number }) {
    return unitConversionsRepository.update(id, data);
  }

  async delete(id: number) {
    return unitConversionsRepository.delete(id);
  }
}
export const unitConversionsService = new UnitConversionsService();
