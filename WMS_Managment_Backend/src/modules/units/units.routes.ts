import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { unitsController } from './units.controller';
const router = Router();

router.use(authenticate);

router.get('/', authorize('units:view'), unitsController.getAll);
router.get('/:code', authorize('units:view'), unitsController.getByCode);
router.post('/', authorize('units:create'), unitsController.create);
router.put('/:code', authorize('units:update'), unitsController.update);
router.delete('/:code', authorize('units:delete'), unitsController.delete);
export default router;