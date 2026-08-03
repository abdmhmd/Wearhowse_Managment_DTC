import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { batchesRepository } from './batches.repository';
import { sendSuccess } from '../../utils/response';

export class BatchesController {
  
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { item_id, warehouse_id, expiring_in_days, search, page, limit } = req.query;
      
      const pageNum = page ? Number(page) : 1;
      const limitNum = limit ? Number(limit) : 20;

      const result = await batchesRepository.findAll({
        item_id: item_id ? Number(item_id) : undefined,
        warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
        expiring_in_days: expiring_in_days ? Number(expiring_in_days) : undefined,
        search: search as string,
        limit: limitNum,
        offset: (pageNum - 1) * limitNum,
      });

      sendSuccess(res, {
        items: result.items,
        pagination: { page: pageNum, limit: limitNum, total: result.total, totalPages: Math.ceil(result.total / limitNum) }
      });
    } catch (err) {
      next(err);
    }
  }
}

export const batchesController = new BatchesController();
