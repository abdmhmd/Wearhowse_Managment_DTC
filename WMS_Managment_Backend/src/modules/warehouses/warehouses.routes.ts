import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { warehousesController } from './warehouses.controller';
const router = Router();

router.use(authenticate);

router.get('/', warehousesController.getAll);
router.get('/:id', warehousesController.getById);
router.post('/', authorize(['warehouse_manager', 'system_admin']), warehousesController.create);
router.put('/:id', authorize(['warehouse_manager', 'system_admin']), warehousesController.update);
router.delete('/:id', authorize(['system_admin']), warehousesController.delete);
export default router;