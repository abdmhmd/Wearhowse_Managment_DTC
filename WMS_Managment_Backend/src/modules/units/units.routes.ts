import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { unitsController } from './units.controller';
const router = Router();

router.use(authenticate);

router.get('/', unitsController.getAll);
router.get('/:code', unitsController.getByCode);
router.post('/', authorize(['warehouse_manager', 'system_admin']), unitsController.create);
router.put('/:code', authorize(['warehouse_manager', 'system_admin']), unitsController.update);
router.delete('/:code', authorize(['system_admin']), unitsController.delete);
export default router;