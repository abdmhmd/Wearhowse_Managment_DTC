import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { categoriesController } from './categories.controller';

const router = Router();

router.use(authenticate);

router.get('/', categoriesController.getAll);
router.get('/:code', categoriesController.getByCode);
router.post('/', authorize(['warehouse_manager', 'system_admin']), categoriesController.create);
router.put('/:code', authorize(['warehouse_manager', 'system_admin']), categoriesController.update);
router.delete('/:code', authorize(['system_admin']), categoriesController.delete);

export default router;
