import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { custodiesService } from './custodies.service';
import { sendData, sendPaginated } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import { writeAudit } from '../authorization/audit.service';

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
        user: req.user,
      });

      sendPaginated(res, result.items, result.pagination);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid custody ID');
      const result = await custodiesService.getById(id, req.user);
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  }

  async returnItem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid custody ID');
      const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
      const condition = typeof req.body?.condition === 'string' ? req.body.condition : undefined;
      const returned_quantity =
        req.body?.returned_quantity != null ? Number(req.body.returned_quantity) : undefined;
      const result = await custodiesService.returnItem(
        id,
        req.user!.id,
        { notes, condition, returned_quantity },
        req.user
      );
      await writeAudit({
        user_id: req.user!.id,
        action: 'CUSTODY_RETURNED',
        resource: 'custodies',
        resource_id: id,
        details: { condition: condition ?? 'good', returned_quantity: returned_quantity ?? null },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم تسجيل إرجاع العهدة بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async receiveReturn(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid custody ID');
      const condition = typeof req.body?.condition === 'string' ? req.body.condition : undefined;
      const result = await custodiesService.receiveReturn(id, req.user!.id, condition, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'CUSTODY_RECEIVED',
        resource: 'custodies',
        resource_id: id,
        details: { action: 'receive_return', condition: condition ?? null },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم تأكيد استلام الإرجاع بنجاح' });
    } catch (err) {
      next(err);
    }
  }
}

export const custodiesController = new CustodiesController();
