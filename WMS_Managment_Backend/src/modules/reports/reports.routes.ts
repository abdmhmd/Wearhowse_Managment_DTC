import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { reportsController } from './reports.controller';

const router = Router();

router.use(authenticate);

router.get('/inventory', authorize('reports:view'), reportsController.getInventoryReport);
router.get('/item-card/:id', authorize('reports:view'), reportsController.getItemCard);

export default router;