import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { custodiesController } from './custodies.controller';

const router = Router();

router.use(authenticate);

// GET /api/custodies — list custodies
router.get(
  '/',
  authorize('custodies:view'),
  custodiesController.getAll.bind(custodiesController)
);

// GET /api/custodies/:id
router.get(
  '/:id',
  authorize('custodies:view'),
  custodiesController.getById.bind(custodiesController)
);

// POST /api/custodies/:id/return — return durable item (creates + approves RTI)
router.post(
  '/:id/return',
  authorize('custodies:return'),
  custodiesController.returnItem.bind(custodiesController)
);

// POST /api/custodies/:id/receive — WM confirms receipt of a return_pending custody
router.post(
  '/:id/receive',
  authorize('custodies:return'),
  custodiesController.receiveReturn.bind(custodiesController)
);

export default router;
