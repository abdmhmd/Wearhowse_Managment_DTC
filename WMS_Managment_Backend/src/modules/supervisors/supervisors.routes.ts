import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { supervisorsController } from './supervisors.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize('supervisors:view'), supervisorsController.getAll);
router.get('/:id', authorize('supervisors:view'), supervisorsController.getById);
router.post('/', authorize('supervisors:create'), supervisorsController.create);
router.patch('/:id', authorize('supervisors:update'), supervisorsController.update);
router.delete('/:id', authorize('supervisors:delete'), supervisorsController.delete);

export default router;
