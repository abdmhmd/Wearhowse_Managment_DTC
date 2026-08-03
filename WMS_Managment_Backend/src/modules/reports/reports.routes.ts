import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { reportsController } from './reports.controller';

const router = Router();

router.use(authenticate);

router.get('/inventory', authorize(['system_admin', 'warehouse_manager', 'accountant']), reportsController.getInventoryReport);
router.get('/item-card/:id', authorize(['system_admin', 'warehouse_manager', 'accountant']), reportsController.getItemCard);

export default router;