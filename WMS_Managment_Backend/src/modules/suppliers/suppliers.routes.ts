import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { suppliersController } from './suppliers.controller';
const router = Router();

router.use(authenticate);

router.get('/', suppliersController.getAll);
router.get('/:id', suppliersController.getById);
router.post('/', authorize(['warehouse_manager', 'system_admin']), suppliersController.create);
router.put('/:id', authorize(['warehouse_manager', 'system_admin']), suppliersController.update);
router.delete('/:id', authorize(['system_admin']), suppliersController.delete);
export default router;