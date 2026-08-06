import { Request, Response, NextFunction } from 'express';
import { categoriesService } from './categories.service';
import { sendData, sendPaginated } from '../../utils/response';
import {
  createCategorySchema,
  updateCategorySchema,
  createSubcategorySchema,
  updateSubcategorySchema,
} from './categories.validator';
import { NotFoundError, ValidationError } from '../../utils/AppError';

export class CategoriesController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await categoriesService.getAllCategories(page, limit);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }

  async getByCode(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await categoriesService.getCategoryByCode(req.params.code);
      if (!data) throw new NotFoundError('Category', 'CATEGORY_NOT_FOUND', { code: req.params.code });
      sendData(res, data);
    } catch (e) { next(e); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createCategorySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await categoriesService.createCategory(parsed.data);
      sendData(res, data, { statusCode: 201 });
    } catch (e) { next(e); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateCategorySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await categoriesService.updateCategory(req.params.code, parsed.data);
      if (!data) throw new NotFoundError('Category', 'CATEGORY_NOT_FOUND', { code: req.params.code });
      sendData(res, data);
    } catch (e) { next(e); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await categoriesService.deleteCategory(req.params.code);
      if (!data) throw new NotFoundError('Category', 'CATEGORY_NOT_FOUND', { code: req.params.code });
      sendData(res, data);
    } catch (e) { next(e); }
  }

  // ---- Subcategories ----

  async getSubcategories(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await categoriesService.getSubcategories(req.params.code);
      sendData(res, data);
    } catch (e) { next(e); }
  }

  async createSubcategory(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createSubcategorySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await categoriesService.createSubcategory(req.params.code, parsed.data);
      sendData(res, data, { statusCode: 201 });
    } catch (e) { next(e); }
  }

  async updateSubcategory(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateSubcategorySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await categoriesService.updateSubcategory(Number(req.params.id), parsed.data);
      if (!data) throw new NotFoundError('Subcategory', 'SUBCATEGORY_NOT_FOUND', { id: req.params.id });
      sendData(res, data);
    } catch (e) { next(e); }
  }

  async deleteSubcategory(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await categoriesService.deleteSubcategory(Number(req.params.id));
      if (!data) throw new NotFoundError('Subcategory', 'SUBCATEGORY_NOT_FOUND', { id: req.params.id });
      sendData(res, data);
    } catch (e) { next(e); }
  }
}
export const categoriesController = new CategoriesController();
