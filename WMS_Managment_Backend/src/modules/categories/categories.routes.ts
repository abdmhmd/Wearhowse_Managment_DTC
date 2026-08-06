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

// Subcategories (registered before any conflicting single-segment route)
router.get('/:code/subcategories', categoriesController.getSubcategories);
router.post('/:code/subcategories', authorize(['warehouse_manager', 'system_admin']), categoriesController.createSubcategory);
router.put('/subcategories/:id', authorize(['warehouse_manager', 'system_admin']), categoriesController.updateSubcategory);
router.delete('/subcategories/:id', authorize(['warehouse_manager', 'system_admin']), categoriesController.deleteSubcategory);

export default router;
