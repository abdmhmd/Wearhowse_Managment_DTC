import { categoriesRepository } from './categories.repository';
import { PaginationMeta } from '../../utils/response';

export class CategoriesService {
  async getAllCategories(page = 1, limit = 20): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      categoriesRepository.findAll(limit, offset),
      categoriesRepository.countAll(),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getCategoryByCode(code: string) {
    return categoriesRepository.findByCode(code);
  }

  async createCategory(category: { code: string; name_ar: string; prefix?: string; description?: string }) {
    return categoriesRepository.create(category);
  }

  async updateCategory(code: string, category: { name_ar?: string; prefix?: string; description?: string }) {
    return categoriesRepository.update(code, category);
  }

  async deleteCategory(code: string) {
    return categoriesRepository.delete(code);
  }
}
export const categoriesService = new CategoriesService();
