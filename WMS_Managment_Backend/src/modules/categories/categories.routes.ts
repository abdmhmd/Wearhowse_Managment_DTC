import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { categoriesController } from './categories.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize('categories:view'), categoriesController.getAll);
router.get('/:code', authorize('categories:view'), categoriesController.getByCode);
router.post('/', authorize('categories:create'), categoriesController.create);
router.put('/:code', authorize('categories:update'), categoriesController.update);
router.delete('/:code', authorize('categories:delete'), categoriesController.delete);

// Subcategories (registered before any conflicting single-segment route)
router.get('/:code/subcategories', authorize('categories:view'), categoriesController.getSubcategories);
router.post('/:code/subcategories', authorize('categories:create'), categoriesController.createSubcategory);
router.put('/subcategories/:id', authorize('categories:update'), categoriesController.updateSubcategory);
router.delete('/subcategories/:id', authorize('categories:delete'), categoriesController.deleteSubcategory);

export default router;
