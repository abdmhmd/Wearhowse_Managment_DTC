import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { materialRequestsService } from './material-requests.service';
import { sendData, sendPaginated } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import { createMaterialRequestSchema, rejectRequestSchema } from './material-requests.validator';
import { writeAudit } from '../authorization/audit.service';

export class MaterialRequestsController {

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const parsed = createMaterialRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await materialRequestsService.createRequest(req.user!.id, parsed.data, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'REQUEST_CREATED',
        resource: 'material_requests',
        resource_id: result.id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { statusCode: 201, message: 'تم إنشاء طلب الصرف بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, department_id, warehouse_id, request_type, page, limit } = req.query;

      // Authorization scoping is enforced centrally in the service/repository
      // via req.user — department_managers see only their department, warehouse
      // roles only their assigned warehouses.
      const dept_id = department_id ? Number(department_id) : undefined;

      const result = await materialRequestsService.getAll({
        status: status as string,
        department_id: dept_id,
        warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
        request_type: request_type as any,
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
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await materialRequestsService.getById(id, req.user);
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  }

  async approve(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await materialRequestsService.approveRequest(id, req.user!.id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'REQUEST_APPROVED',
        resource: 'material_requests',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم قبول الطلب بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async forward(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await materialRequestsService.forwardRequest(id, req.user!.id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'REQUEST_FORWARDED',
        resource: 'material_requests',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم تحويل الطلب إلى المستودع بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async reject(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const parsed = rejectRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const result = await materialRequestsService.rejectRequest(id, req.user!.id, parsed.data.reason, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'REQUEST_REJECTED',
        resource: 'material_requests',
        resource_id: id,
        details: { reason: parsed.data.reason },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم رفض الطلب' });
    } catch (err) {
      next(err);
    }
  }

  async issue(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await materialRequestsService.issueRequest(id, req.user!.id, req.user);
      await writeAudit({
        user_id: req.user!.id,
        action: 'REQUEST_ISSUED',
        resource: 'material_requests',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم إصدار إذن الصرف بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await materialRequestsService.cancelRequest(
        id,
        req.user!.id,
        req.user!.role,
        req.user
      );
      await writeAudit({
        user_id: req.user!.id,
        action: 'REQUEST_CANCELLED',
        resource: 'material_requests',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم إلغاء الطلب' });
    } catch (err) {
      next(err);
    }
  }
}

export const materialRequestsController = new MaterialRequestsController();

