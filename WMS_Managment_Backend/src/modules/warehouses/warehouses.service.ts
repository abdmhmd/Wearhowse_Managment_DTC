import { warehousesRepository } from './warehouses.repository';
import type { WarehouseListFilters } from './warehouses.repository';
import { departmentsRepository } from '../departments/departments.repository';
import { PaginationMeta } from '../../utils/response';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import type { AuthUserContext } from '../authorization/authorization.service';

export class WarehousesService {
  async getAll(
    page = 1,
    limit = 20,
    user?: AuthUserContext,
    filters?: WarehouseListFilters
  ): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      warehousesRepository.findAll(limit, offset, user, filters),
      warehousesRepository.countAll(user, filters),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: number, user?: AuthUserContext) {
    return warehousesRepository.findById(id, user);
  }

  /** A warehouse may be central (department_id null) but never link a department that does not exist. */
  private async assertDepartmentExists(departmentId: number | null | undefined) {
    if (departmentId == null) return;
    const department = await departmentsRepository.findById(departmentId);
    if (!department) throw new NotFoundError('Department', 'DEPARTMENT_NOT_FOUND', { id: departmentId });
  }

  async create(data: { code: string; name_ar: string; name_en?: string; location?: string; is_main?: boolean; department_id?: number | null }) {
    await this.assertDepartmentExists(data.department_id);
    if (data.is_main) {
      const existing = await warehousesRepository.findActiveMain(data.department_id ?? null);
      if (existing) {
        throw new ValidationError(
          `A main warehouse already exists for this department ('${existing.code}'); only one active main warehouse is allowed per department`,
          { department_id: data.department_id ?? null, existing_warehouse: existing.code },
          'MAIN_WAREHOUSE_EXISTS'
        );
      }
    }
    return warehousesRepository.create(data);
  }

  async update(id: number, data: { code?: string; name_ar?: string; name_en?: string; location?: string; is_main?: boolean; department_id?: number | null }) {
    await this.assertDepartmentExists(data.department_id);
    if (data.is_main) {
      const current = await warehousesRepository.findById(id);
      if (!current) throw new NotFoundError('Warehouse', 'WAREHOUSE_NOT_FOUND', { id });
      const departmentId = data.department_id !== undefined ? data.department_id : current.department_id;
      const existing = await warehousesRepository.findActiveMain(departmentId ?? null, id);
      if (existing) {
        throw new ValidationError(
          `A main warehouse already exists for this department ('${existing.code}'); only one active main warehouse is allowed per department`,
          { department_id: departmentId ?? null, existing_warehouse: existing.code },
          'MAIN_WAREHOUSE_EXISTS'
        );
      }
    }
    return warehousesRepository.update(id, data);
  }

  async delete(id: number) {
    return warehousesRepository.delete(id);
  }
}
export const warehousesService = new WarehousesService();
