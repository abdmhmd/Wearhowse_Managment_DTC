import { Request, Response, NextFunction } from 'express';
import { warehousesService } from './warehouses.service';
import { sendData, sendPaginated } from '../../utils/response';
import { createWarehouseSchema, updateWarehouseSchema } from './warehouses.validator';
import { NotFoundError, ValidationError } from '../../utils/AppError';

export class WarehousesController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await warehousesService.getAll(page, limit);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid warehouse ID');
      const data = await warehousesService.getById(id);
      if (!data) throw new NotFoundError('Warehouse', 'WAREHOUSE_NOT_FOUND', { id: req.params.id });
      sendData(res, data);
    } catch (e) { next(e); }
  }
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createWarehouseSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await warehousesService.create(parsed.data);
      sendData(res, data, { statusCode: 201 });
    } catch (e) { next(e); }
  }
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid warehouse ID');
      const parsed = updateWarehouseSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await warehousesService.update(id, parsed.data);
      if (!data) throw new NotFoundError('Warehouse', 'WAREHOUSE_NOT_FOUND', { id: req.params.id });
      sendData(res, data);
    } catch (e) { next(e); }
  }
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid warehouse ID');
      const data = await warehousesService.delete(id);
      if (!data) throw new NotFoundError('Warehouse', 'WAREHOUSE_NOT_FOUND', { id: req.params.id });
      sendData(res, data);
    } catch (e) { next(e); }
  }
}
export const warehousesController = new WarehousesController();
