import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { alertsRepository } from './alerts.repository';
import { sendData, sendPaginated } from '../../utils/response';
import { NotFoundError } from '../../utils/AppError';

const router = Router();
router.use(authenticate);

// GET /api/alerts — list alerts
router.get('/', authorize('alerts:view'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { status, type, warehouse_id, page, limit } = req.query;
    const pageNum  = page  ? Number(page)  : 1;
    const limitNum = limit ? Number(limit) : 50;
    const result = await alertsRepository.findAll({
      status: status as any,
      type: type as any,
      warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      user: req.user,
    });
    sendPaginated(res, result.items, { page: pageNum, limit: limitNum, total: result.total, totalPages: Math.ceil(result.total / limitNum) });
  } catch (err) { next(err); }
});

// GET /api/alerts/summary — dashboard count per type
router.get('/summary', authorize('alerts:view'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await alertsRepository.findSummary(req.user);
    sendData(res, result);
  } catch (err) { next(err); }
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', authorize('alerts:acknowledge'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await alertsRepository.acknowledge(Number(req.params.id), req.user!.id, req.user);
    if (!result) {
      // Not found OR outside the caller's warehouse scope — same 404 response
      // so cross-warehouse ids cannot be probed.
      return next(new NotFoundError('Alert', 'ALERT_NOT_FOUND', { id: req.params.id }));
    }
    sendData(res, result, { message: 'تم تأكيد الاطلاع على التنبيه' });
  } catch (err) { next(err); }
});

export default router;
