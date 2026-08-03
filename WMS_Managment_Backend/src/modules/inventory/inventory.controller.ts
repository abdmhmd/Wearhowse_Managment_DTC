import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { inventoryService } from './inventory.service';
import { sendSuccess } from '../../utils/response';
import { openSessionSchema, recordCountSchema } from './inventory.validator';
import { ValidationError } from '../../utils/AppError';

export class InventoryController {
  async openSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const parsed = openSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message);
      }
      const result = await inventoryService.openSession(parsed.data.warehouse_id, req.user!.id, parsed.data.notes);
      sendSuccess(res, result, 'تم فتح جلسة الجرد بنجاح', 201);
    } catch (err) {
      next(err);
    }
  }

  async getSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const sessionId = Number(req.params.id);
      if (isNaN(sessionId)) {
        throw new ValidationError('Invalid session ID');
      }
      const result = await inventoryService.getSession(sessionId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  async recordCount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const sessionId = Number(req.params.id);
      if (isNaN(sessionId)) {
        throw new ValidationError('Invalid session ID');
      }
      const parsed = recordCountSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message);
      }
      const result = await inventoryService.recordCount(
        sessionId,
        parsed.data.item_id,
        parsed.data.counted_qty,
        req.user!.id,
        parsed.data.notes
      );
      sendSuccess(res, result, 'تم تسجيل العدّ بنجاح');
    } catch (err) {
      next(err);
    }
  }

  async closeSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const sessionId = Number(req.params.id);
      if (isNaN(sessionId)) {
        throw new ValidationError('Invalid session ID');
      }
      const result = await inventoryService.closeSession(sessionId, req.user!.id);
      sendSuccess(res, result, 'تم إغلاق جلسة الجرد وتطبيق الفروقات');
    } catch (err) {
      next(err);
    }
  }
}

export const inventoryController = new InventoryController();
