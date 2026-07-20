import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { reportsController } from './reports.controller';

const router = Router();

router.use(authenticate);

router.get('/inventory', authorize(['warehouse_manager', 'system_admin']), reportsController.getInventoryReport);
router.get('/item-card/:id', authorize(['warehouse_manager', 'system_admin']), reportsController.getItemCard);

export default router;