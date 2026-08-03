import { Router } from 'express';
import { authenticate, authorize, ROLES } from '../../middlewares/auth.middleware';
import { custodiesController } from './custodies.controller';

const router = Router();

router.use(authenticate);

// GET /api/custodies — list custodies
router.get(
  '/',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager', 'accountant', 'viewer']),
  custodiesController.getAll.bind(custodiesController)
);

// GET /api/custodies/:id
router.get(
  '/:id',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager', 'accountant', 'viewer']),
  custodiesController.getById.bind(custodiesController)
);

// POST /api/custodies/:id/return — return durable item (creates + approves RTI)
router.post(
  '/:id/return',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager']),
  custodiesController.returnItem.bind(custodiesController)
);

export default router;
