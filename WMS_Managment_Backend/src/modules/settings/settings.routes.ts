import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { settingsController } from './settings.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize('settings:view'), settingsController.getAll);
router.put('/', authorize('settings:update'), settingsController.update);

export default router;
