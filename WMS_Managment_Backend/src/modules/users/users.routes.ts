import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { usersController } from './users.controller';
const router = Router();

router.use(authenticate);

router.get('/', usersController.getAll);
router.get('/:id', usersController.getById);
router.post('/', authorize(['system_admin']), usersController.create);
router.put('/:id', authorize(['system_admin']), usersController.update);
router.delete('/:id', authorize(['system_admin']), usersController.delete);
export default router;