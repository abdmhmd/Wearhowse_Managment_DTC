import { Response, NextFunction } from 'express';
import { transactionsService } from './transactions.service';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { sendData, sendPaginated } from '../../utils/response';
import { createDraftSchema } from './transactions.validator';
import { AuthError, NotFoundError, ValidationError } from '../../utils/AppError';
import { writeAudit } from '../authorization/audit.service';

export class TransactionsController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const type = req.query.type as string | undefined;
      const status = req.query.status as string | undefined;
      const { items, pagination } = await transactionsService.getAll(page, limit, type, status, req.user);
      sendPaginated(res, items, pagination);
    } catch (e) { next(e); }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid transaction ID');
      const data = await transactionsService.getById(id, req.user);
      if (!data) throw new NotFoundError('Transaction', 'TRANSACTION_NOT_FOUND');
      sendData(res, data);
    } catch (e) { next(e); }
  }

  async createDraft(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthError('Authentication required', 'AUTH_UNAUTHORIZED');
      const parsed = createDraftSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const { header, details } = parsed.data;
      const transaction = await transactionsService.createDraft(
        { ...header, created_by: req.user.userId }, details
      );
      sendData(res, transaction, { statusCode: 201 });
    } catch (error: any) {
      next(error);
    }
  }

  async approve(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthError('Authentication required', 'AUTH_UNAUTHORIZED');
      const id = Number(req.params.id);
      if (isNaN(id)) throw new ValidationError('Invalid transaction ID');
      const existing = await transactionsService.getById(id, req.user);
      if (!existing) throw new NotFoundError('Transaction', 'TRANSACTION_NOT_FOUND');
      const result = await transactionsService.approveTransaction(id, req.user.userId);
      await writeAudit({
        user_id: req.user.userId,
        action: 'TRANSACTION_APPROVED',
        resource: 'transactions',
        resource_id: id,
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(res, result);
    } catch (error: any) {
      next(error);
    }
  }
}
export const transactionsController = new TransactionsController();
