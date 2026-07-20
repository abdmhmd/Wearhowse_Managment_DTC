import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { itemsController } from './items.controller';
const router = Router();

router.use(authenticate);

router.get('/', itemsController.getAll);
router.get('/:id', itemsController.getById);
router.post('/', authorize(['storekeeper', 'warehouse_manager', 'system_admin']), itemsController.create);
router.put('/:id', authorize(['warehouse_manager', 'system_admin']), itemsController.update);
router.delete('/:id', authorize(['system_admin']), itemsController.delete);
export default router;
