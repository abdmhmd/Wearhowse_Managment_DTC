import { Router } from 'express';
import { authenticate, authorize, ROLES } from '../../middlewares/auth.middleware';
import { batchesController } from './batches.controller';

const router = Router();
router.use(authenticate);

// GET /api/batches — list batches (supports filtering by expiration)
router.get(
  '/',
  authorize([...ROLES.ALL_STAFF]),
  batchesController.getAll.bind(batchesController)
);

export default router;
