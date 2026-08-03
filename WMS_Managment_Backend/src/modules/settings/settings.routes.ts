import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { settingsController } from './settings.controller';

const router = Router();

router.use(authenticate);

router.get('/', settingsController.getAll);
router.put('/', authorize(['system_admin']), settingsController.update);

export default router;
