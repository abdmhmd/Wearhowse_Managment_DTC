import { Request, Response, NextFunction } from 'express';
import { itemsService } from './items.service';
import { sendSuccess } from '../../utils/response';
import { createItemSchema, updateItemSchema } from './items.validator';
import { ValidationError } from '../../utils/AppError';

export class ItemsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const filter = {
        category_code: req.query.category_code as string | undefined,
        warehouse_id: req.query.warehouse_id ? Number(req.query.warehouse_id) : undefined,
        search: req.query.search as string | undefined,
        is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      };
      const { items, pagination } = await itemsService.getAll(page, limit, filter);
      sendSuccess(res, items, 200, pagination);
    } catch (e) { next(e); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const item = await itemsService.createItem(parsed.data);
      sendSuccess(res, item, 201);
    } catch (e) { next(e); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await itemsService.getItemCard(Number(req.params.id));
      sendSuccess(res, item);
    } catch (e) { next(e); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateItemSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const item = await itemsService.updateItem(Number(req.params.id), parsed.data);
      sendSuccess(res, item);
    } catch (e) { next(e); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await itemsService.deleteItem(Number(req.params.id));
      sendSuccess(res, result);
    } catch (e) { next(e); }
  }
}
export const itemsController = new ItemsController();
