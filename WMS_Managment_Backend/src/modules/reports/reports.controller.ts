import { Request, Response, NextFunction } from 'express';
import { inventoryReportService } from './inventoryReport.service';
import { itemsService } from '../items/items.service';
import { sendData, sendPaginated } from '../../utils/response';
import { inventoryReportQuerySchema, itemCardParamsSchema } from './reports.validator';
import { ValidationError } from '../../utils/AppError';

export class ReportsController {
  async getInventoryReport(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = inventoryReportQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const { page, limit, ...rest } = parsed.data;
      const filters = {
        ...rest,
        is_active: rest.is_active !== undefined ? rest.is_active === 'true' : undefined,
        low_stock: rest.low_stock === 'true' || undefined,
        overstock: rest.overstock === 'true' || undefined,
        page, limit,
      };
      const { items, pagination } = await inventoryReportService.getInventoryReport(filters);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }

  async getItemCard(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = itemCardParamsSchema.safeParse(req.params);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await itemsService.getItemCard(parsed.data.id);
      sendData(res, data);
    } catch (e) { next(e); }
  }
}
export const reportsController = new ReportsController();
