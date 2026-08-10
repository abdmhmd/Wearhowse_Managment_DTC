import { Request, Response, NextFunction } from 'express';
import { itemsService } from './items.service';
import { sendData, sendPaginated } from '../../utils/response';
import { createItemSchema, updateItemSchema } from './items.validator';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';

export class ItemsController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const filter = {
        category_code: req.query.category_code as string | undefined,
        warehouse_id: req.query.warehouse_id ? Number(req.query.warehouse_id) : undefined,
        search: req.query.search as string | undefined,
        is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      };
      const { items, pagination } = await itemsService.getAll(page, limit, filter, req.user);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }

  async generateCode(req: Request, res: Response, next: NextFunction) {
    try {
      const code = await itemsService.generateItemCode(req.params.categoryCode);
      sendData(res, { item_code: code });
    } catch (e) { next(e); }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const item = await itemsService.createItem(parsed.data, req.user);
      sendData(res, item, { statusCode: 201 });
    } catch (e) { next(e); }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid item ID');
      const item = await itemsService.getItemCard(id, req.user);
      if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND', { id: req.params.id });
      sendData(res, item);
    } catch (e) { next(e); }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid item ID');
      const parsed = updateItemSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const item = await itemsService.updateItem(id, parsed.data, req.user);
      sendData(res, item);
    } catch (e) { next(e); }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid item ID');
      const result = await itemsService.deleteItem(id);
      sendData(res, result);
    } catch (e) { next(e); }
  }
}
export const itemsController = new ItemsController();
