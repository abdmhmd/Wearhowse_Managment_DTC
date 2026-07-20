import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { unitConversionsController } from './unit-conversions.controller';
const router = Router();

router.use(authenticate);

router.get('/', unitConversionsController.getAll);
router.get('/item/:itemId', unitConversionsController.getByItemId);
router.post('/', authorize(['warehouse_manager', 'system_admin']), unitConversionsController.create);
router.put('/:id', authorize(['warehouse_manager', 'system_admin']), unitConversionsController.update);
router.delete('/:id', authorize(['system_admin']), unitConversionsController.delete);
export default router;