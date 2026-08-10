import { Request, Response, NextFunction } from 'express';
import { stockMovementsService } from './stock-movements.service';
import { sendPaginated } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';

export class StockMovementsController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await stockMovementsService.getAll(page, limit, req.user);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }

  async getByItemId(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const itemId = Number(req.params.itemId);
      if (isNaN(itemId)) throw new ValidationError('Invalid item ID');
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await stockMovementsService.getByItemId(itemId, page, limit, req.user);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }

  async getByTransactionId(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const transactionId = Number(req.params.transactionId);
      if (isNaN(transactionId)) throw new ValidationError('Invalid transaction ID');
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await stockMovementsService.getByTransactionId(transactionId, page, limit, req.user);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }
}
export const stockMovementsController = new StockMovementsController();
