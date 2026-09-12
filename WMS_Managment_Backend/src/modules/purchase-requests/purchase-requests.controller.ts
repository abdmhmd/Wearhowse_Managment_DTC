import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { purchaseRequestsService } from './purchase-requests.service';
import { sendData, sendPaginated } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import { createPurchaseRequestSchema, rejectPurchaseRequestSchema } from './purchase-requests.validators';
import { writeAudit } from '../authorization/audit.service';

export class PurchaseRequestsController {

  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, page, limit } = req.query;

      const result = await purchaseRequestsService.getAll({
        status: status as string | undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        user: req.user!,
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
      const result = await purchaseRequestsService.getById(id, req.user!);
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const parsed = createPurchaseRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const result = await purchaseRequestsService.create(parsed.data, req.user!);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PR_CREATED',
        resource: 'purchase_requests',
        resource_id: result.id,
        details: { request_no: result.request_no },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { statusCode: 201, message: 'تم إنشاء طلب الشراء بنجاح' });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await purchaseRequestsService.cancel(id, req.user!);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PR_CANCELLED',
        resource: 'purchase_requests',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم إلغاء طلب الشراء' });
    } catch (err) {
      next(err);
    }
  }

  async approveDept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await purchaseRequestsService.approveDept(id, req.user!);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PR_DEPT_APPROVED',
        resource: 'purchase_requests',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تمت الموافقة على طلب الشراء' });
    } catch (err) {
      next(err);
    }
  }

  async rejectDept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const parsed = rejectPurchaseRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const result = await purchaseRequestsService.rejectDept(id, parsed.data.reason, req.user!);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PR_DEPT_REJECTED',
        resource: 'purchase_requests',
        resource_id: id,
        details: { reason: parsed.data.reason },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم رفض طلب الشراء' });
    } catch (err) {
      next(err);
    }
  }

  async approveAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const result = await purchaseRequestsService.approveAdmin(id, req.user!);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PR_ADMIN_APPROVED',
        resource: 'purchase_requests',
        resource_id: id,
        details: result.purchase_order_id != null ? { purchase_order_id: result.purchase_order_id } : undefined,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تمت الموافقة على طلب الشراء وتوليد أمر الشراء' });
    } catch (err) {
      next(err);
    }
  }

  async rejectAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid request ID');
      const parsed = rejectPurchaseRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
      const result = await purchaseRequestsService.rejectAdmin(id, parsed.data.reason, req.user!);
      await writeAudit({
        user_id: req.user!.id,
        action: 'PR_ADMIN_REJECTED',
        resource: 'purchase_requests',
        resource_id: id,
        details: { reason: parsed.data.reason },
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result, { message: 'تم رفض طلب الشراء' });
    } catch (err) {
      next(err);
    }
  }
}

export const purchaseRequestsController = new PurchaseRequestsController();