import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { usersController } from './users.controller';
const router = Router();

router.use(authenticate);

router.get('/', authorize('users:view'), usersController.getAll);
router.get('/supervisors', authorize('projects:supervisors'), usersController.getSupervisors);
router.get('/:id', authorize('users:view'), usersController.getById);
router.post('/', authorize('users:create'), usersController.create);
router.put('/:id', authorize('users:update'), usersController.update);
router.delete('/:id', authorize('users:delete'), usersController.delete);
export default router;
