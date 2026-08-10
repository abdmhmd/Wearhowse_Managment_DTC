import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { warehousesController } from './warehouses.controller';
const router = Router();

router.use(authenticate);

router.get('/', authorize('warehouses:view'), warehousesController.getAll);
router.get('/:id', authorize('warehouses:view'), warehousesController.getById);
router.post('/', authorize('warehouses:create'), warehousesController.create);
router.put('/:id', authorize('warehouses:update'), warehousesController.update);
router.delete('/:id', authorize('warehouses:delete'), warehousesController.delete);
export default router;