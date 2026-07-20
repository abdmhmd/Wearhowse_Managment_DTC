import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { departmentsController } from './departments.controller';
const router = Router();

router.use(authenticate);

router.get('/', departmentsController.getAll);
router.get('/:code', departmentsController.getByCode);
router.post('/', authorize(['warehouse_manager', 'system_admin']), departmentsController.create);
router.put('/:code', authorize(['warehouse_manager', 'system_admin']), departmentsController.update);
router.delete('/:code', authorize(['system_admin']), departmentsController.delete);
export default router;