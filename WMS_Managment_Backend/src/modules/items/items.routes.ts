import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { itemsController } from './items.controller';
const router = Router();

router.use(authenticate);

router.get('/', authorize('items:view'), itemsController.getAll);
router.get('/generate-code/:categoryCode', authorize('items:view'), itemsController.generateCode);
router.get('/:id', authorize('items:view'), itemsController.getById);
router.post('/', authorize('items:create'), itemsController.create);
router.put('/:id', authorize('items:update'), itemsController.update);
router.delete('/:id', authorize('items:delete'), itemsController.delete);
export default router;
