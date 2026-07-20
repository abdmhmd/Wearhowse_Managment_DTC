import { warehousesRepository } from './warehouses.repository';
import { PaginationMeta } from '../../utils/response';
export class WarehousesService {
  async getAll(page = 1, limit = 20): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      warehousesRepository.findAll(limit, offset),
      warehousesRepository.countAll(),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number) {
    return warehousesRepository.findById(id);
  }

  async create(data: { code: string; name_ar: string; location?: string }) {
    return warehousesRepository.create(data);
  }

  async update(id: number, data: { code?: string; name_ar?: string; location?: string }) {
    return warehousesRepository.update(id, data);
  }

  async delete(id: number) {
    return warehousesRepository.delete(id);
  }
}
export const warehousesService = new WarehousesService();
