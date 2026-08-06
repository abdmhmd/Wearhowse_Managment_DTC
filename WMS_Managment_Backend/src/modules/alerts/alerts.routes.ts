import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { authenticate, authorize, ROLES } from '../../middlewares/auth.middleware';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { alertsRepository } from './alerts.repository';
import { sendData, sendPaginated } from '../../utils/response';

const router = Router();
router.use(authenticate);

// GET /api/alerts — list alerts
router.get('/', authorize([...ROLES.ALL_STAFF]), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
    });
    sendPaginated(res, result.items, { page: pageNum, limit: limitNum, total: result.total, totalPages: Math.ceil(result.total / limitNum) });
  } catch (err) { next(err); }
});

// GET /api/alerts/summary — dashboard count per type
router.get('/summary', authorize([...ROLES.ALL_STAFF]), async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await alertsRepository.findSummary();
    sendData(res, result);
  } catch (err) { next(err); }
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', authorize([...ROLES.WAREHOUSE_OPS, 'department_manager']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await alertsRepository.acknowledge(Number(req.params.id), req.user!.id);
    sendData(res, result, { message: 'تم تأكيد الاطلاع على التنبيه' });
  } catch (err) { next(err); }
});

export default router;
