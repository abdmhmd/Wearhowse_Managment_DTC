import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { materialRequestsService } from './material-requests.service';
import { sendSuccess } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import { createMaterialRequestSchema, rejectRequestSchema } from './material-requests.validator';

export class MaterialRequestsController {

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const parsed = createMaterialRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await materialRequestsService.createRequest(req.user!.id, parsed.data);
      sendSuccess(res, result, 'تم إنشاء طلب الصرف بنجاح', 201);
    } catch (err) {
      next(err);
    }
  }

  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, department_id, warehouse_id, request_type, page, limit } = req.query;

      // department_managers can only see their own department's requests
      let dept_id = department_id ? Number(department_id) : undefined;
      if (req.user!.role === 'department_manager') {
        dept_id = req.user!.department_id ?? dept_id;
      }

      const result = await materialRequestsService.getAll({
        status: status as string,
        department_id: dept_id,
        warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
        request_type: request_type as any,
        requested_by: req.user!.role === 'department_manager' ? req.user!.id : undefined,
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
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await materialRequestsService.getById(id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async approve(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await materialRequestsService.approveRequest(id, req.user!.id);
      sendSuccess(res, result, 'تم قبول الطلب بنجاح');
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
      const result = await materialRequestsService.rejectRequest(id, req.user!.id, parsed.data.reason);
      sendSuccess(res, result, 'تم رفض الطلب');
    } catch (err) {
      next(err);
    }
  }

  async issue(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await materialRequestsService.issueRequest(id, req.user!.id);
      sendSuccess(res, result, 'تم إصدار إذن الصرف بنجاح');
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
        req.user!.role
      );
      sendSuccess(res, result, 'تم إلغاء الطلب');
    } catch (err) {
      next(err);
    }
  }
}

export const materialRequestsController = new MaterialRequestsController();

