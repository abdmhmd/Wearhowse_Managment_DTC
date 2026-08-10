import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { suppliersController } from './suppliers.controller';
const router = Router();

router.use(authenticate);

router.get('/', authorize('suppliers:view'), suppliersController.getAll);
router.get('/:id', authorize('suppliers:view'), suppliersController.getById);
router.post('/', authorize('suppliers:create'), suppliersController.create);
router.put('/:id', authorize('suppliers:update'), suppliersController.update);
router.delete('/:id', authorize('suppliers:delete'), suppliersController.delete);
export default router;