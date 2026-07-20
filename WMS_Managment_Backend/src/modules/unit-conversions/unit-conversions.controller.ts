import { Request, Response, NextFunction } from 'express';
import { unitConversionsService } from './unit-conversions.service';
import { sendSuccess } from '../../utils/response';
import { createUnitConversionSchema, updateUnitConversionSchema } from './unit-conversions.validator';
import { NotFoundError, ValidationError } from '../../utils/AppError';

export class UnitConversionsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, pagination } = await unitConversionsService.getAll(page, limit);
      sendSuccess(res, items, 200, pagination);
    } catch (e) { next(e); }
  }
  async getByItemId(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await unitConversionsService.getByItemId(Number(req.params.itemId));
      sendSuccess(res, data);
    } catch (e) { next(e); }
  }
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createUnitConversionSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await unitConversionsService.create(parsed.data);
      sendSuccess(res, data, 201);
    } catch (e) { next(e); }
  }
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateUnitConversionSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const data = await unitConversionsService.update(Number(req.params.id), parsed.data);
      if (!data) throw new NotFoundError('Unit conversion', 'CONVERSION_NOT_FOUND', { id: req.params.id });
      sendSuccess(res, data);
    } catch (e) { next(e); }
  }
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await unitConversionsService.delete(Number(req.params.id));
      if (!data) throw new NotFoundError('Unit conversion', 'CONVERSION_NOT_FOUND', { id: req.params.id });
      sendSuccess(res, data);
    } catch (e) { next(e); }
  }
}
export const unitConversionsController = new UnitConversionsController();
