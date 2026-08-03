import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { custodiesService } from './custodies.service';
import { sendSuccess } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';

export class CustodiesController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, assigned_to, project_id, warehouse_id, page, limit } = req.query;

      const result = await custodiesService.getAll({
        status: status as any,
        assigned_to: assigned_to ? Number(assigned_to) : undefined,
        project_id: project_id ? Number(project_id) : undefined,
        warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid custody ID');
      const result = await custodiesService.getById(id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async returnItem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid custody ID');
      const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
      const result = await custodiesService.returnItem(id, req.user!.id, notes);
      sendSuccess(res, result, 'تم تسجيل إرجاع العهدة بنجاح');
    } catch (err) {
      next(err);
    }
  }
}

export const custodiesController = new CustodiesController();
