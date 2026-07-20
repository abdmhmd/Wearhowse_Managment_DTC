import { Request, Response, NextFunction } from 'express';
import { transactionsService } from './transactions.service';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { sendSuccess } from '../../utils/response';
import { createDraftSchema } from './transactions.validator';
import { AuthError, NotFoundError, ValidationError } from '../../utils/AppError';

export class TransactionsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const type = req.query.type as string | undefined;
      const status = req.query.status as string | undefined;
      const { items, pagination } = await transactionsService.getAll(page, limit, type, status);
      sendSuccess(res, items, 200, pagination);
    } catch (e) { next(e); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await transactionsService.getById(Number(req.params.id));
      if (!data) throw new NotFoundError('Transaction', 'TRANSACTION_NOT_FOUND', { id: req.params.id });
      sendSuccess(res, data);
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
      sendSuccess(res, transaction, 201);
    } catch (error: any) {
      next(error);
    }
  }

  async approve(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthError('Authentication required', 'AUTH_UNAUTHORIZED');
      const result = await transactionsService.approveTransaction(Number(req.params.id), req.user.userId);
      sendSuccess(res, result);
    } catch (error: any) {
      next(error);
    }
  }
}
export const transactionsController = new TransactionsController();
