import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { departmentsController } from './departments.controller';
const router = Router();

router.use(authenticate);

router.get('/', authorize('departments:view'), departmentsController.getAll);
router.get('/:code', authorize('departments:view'), departmentsController.getByCode);
router.post('/', authorize('departments:create'), departmentsController.create);
router.put('/:code', authorize('departments:update'), departmentsController.update);
router.delete('/:code', authorize('departments:delete'), departmentsController.delete);
export default router;