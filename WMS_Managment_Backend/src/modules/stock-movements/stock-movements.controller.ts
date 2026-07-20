import { Request, Response, NextFunction } from 'express';
import { stockMovementsService } from './stock-movements.service';
import { sendSuccess } from '../../utils/response';

export class StockMovementsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await stockMovementsService.getAll(page, limit);
      sendSuccess(res, items, 200, pagination);
    } catch (e) { next(e); }
  }

  async getByItemId(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await stockMovementsService.getByItemId(Number(req.params.itemId), page, limit);
      sendSuccess(res, items, 200, pagination);
    } catch (e) { next(e); }
  }

  async getByTransactionId(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await stockMovementsService.getByTransactionId(Number(req.params.transactionId), page, limit);
      sendSuccess(res, items, 200, pagination);
    } catch (e) { next(e); }
  }
}
export const stockMovementsController = new StockMovementsController();
