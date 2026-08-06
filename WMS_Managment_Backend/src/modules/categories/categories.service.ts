import { categoriesRepository } from './categories.repository';
import { subcategoriesRepository } from './subcategories.repository';
import { PaginationMeta } from '../../utils/response';
import { ValidationError, ConflictError, NotFoundError } from '../../utils/AppError';

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

  async createCategory(category: { code: string; name_ar: string; name_en?: string; prefix?: string; description?: string; parent_code?: string | null }) {
    if (category.parent_code && !(await categoriesRepository.exists(category.parent_code))) {
      throw new ValidationError(`Parent category '${category.parent_code}' not found`, { code: category.parent_code });
    }
    if (category.parent_code === category.code) {
      throw new ValidationError('A category cannot be its own parent', { code: category.code });
    }
    return categoriesRepository.create(category);
  }

  async updateCategory(code: string, category: { name_ar?: string; name_en?: string; prefix?: string; description?: string; parent_code?: string | null }) {
    if (category.parent_code && !(await categoriesRepository.exists(category.parent_code))) {
      throw new ValidationError(`Parent category '${category.parent_code}' not found`, { code: category.parent_code });
    }
    return categoriesRepository.update(code, category);
  }

  async deleteCategory(code: string) {
    return categoriesRepository.delete(code);
  }

  // ---- Subcategories ----

  async getSubcategories(categoryCode: string) {
    const category = await categoriesRepository.findByCode(categoryCode);
    if (!category) throw new NotFoundError('Category', 'CATEGORY_NOT_FOUND', { code: categoryCode });
    return subcategoriesRepository.findByCategory(categoryCode);
  }

  async createSubcategory(
    categoryCode: string,
    data: { code: string; name_ar: string; name_en?: string; description?: string }
  ) {
    const category = await categoriesRepository.findByCode(categoryCode);
    if (!category) throw new NotFoundError('Category', 'CATEGORY_NOT_FOUND', { code: categoryCode });

    const existing = await subcategoriesRepository.findByCode(categoryCode, data.code);
    if (existing) {
      throw new ConflictError(
        `Subcategory '${data.code}' already exists under category '${categoryCode}'`,
        'DUPLICATE_SUBCATEGORY',
        { code: data.code, category_code: categoryCode }
      );
    }
    return subcategoriesRepository.create({ ...data, category_code: categoryCode });
  }

  async updateSubcategory(id: number, data: { name_ar?: string; name_en?: string; description?: string; is_active?: boolean }) {
    const sub = await subcategoriesRepository.findById(id);
    if (!sub) throw new NotFoundError('Subcategory', 'SUBCATEGORY_NOT_FOUND', { id });
    return subcategoriesRepository.update(id, data);
  }

  async deleteSubcategory(id: number) {
    const sub = await subcategoriesRepository.findById(id);
    if (!sub) throw new NotFoundError('Subcategory', 'SUBCATEGORY_NOT_FOUND', { id });
    return subcategoriesRepository.delete(id);
  }
}
export const categoriesService = new CategoriesService();
