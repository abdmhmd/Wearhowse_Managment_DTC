import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { unitConversionsController } from './unit-conversions.controller';
const router = Router();

router.use(authenticate);

router.get('/', authorize('unit-conversions:view'), unitConversionsController.getAll);
router.get('/item/:itemId', authorize('unit-conversions:view'), unitConversionsController.getByItemId);
router.post('/', authorize('unit-conversions:create'), unitConversionsController.create);
router.put('/:id', authorize('unit-conversions:update'), unitConversionsController.update);
router.delete('/:id', authorize('unit-conversions:delete'), unitConversionsController.delete);
export default router;