import { Router } from 'express';
import { authenticate, authorize, ROLES } from '../../middlewares/auth.middleware';
import { materialRequestsController } from './material-requests.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/requests — list requests (scoped by role automatically in controller)
router.get(
  '/',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager', 'accountant', 'viewer']),
  materialRequestsController.getAll.bind(materialRequestsController)
);

// GET /api/requests/:id — view single request
router.get(
  '/:id',
  authorize([...ROLES.WAREHOUSE_OPS, 'department_manager', 'accountant', 'viewer']),
  materialRequestsController.getById.bind(materialRequestsController)
);

// POST /api/requests — create new request (department_manager or above)
router.post(
  '/',
  authorize([...ROLES.CAN_REQUEST]),
  materialRequestsController.create.bind(materialRequestsController)
);

// PATCH /api/requests/:id/approve — warehouse approves
router.patch(
  '/:id/approve',
  authorize([...ROLES.WAREHOUSE_OPS]),
  materialRequestsController.approve.bind(materialRequestsController)
);

// PATCH /api/requests/:id/reject — warehouse rejects
router.patch(
  '/:id/reject',
  authorize([...ROLES.WAREHOUSE_OPS]),
  materialRequestsController.reject.bind(materialRequestsController)
);

// POST /api/requests/:id/issue — storekeeper issues LN voucher
router.post(
  '/:id/issue',
  authorize([...ROLES.WAREHOUSE_OPS]),
  materialRequestsController.issue.bind(materialRequestsController)
);

// PATCH /api/requests/:id/cancel — requester or manager cancels
router.patch(
  '/:id/cancel',
  authorize([...ROLES.CAN_REQUEST, ...ROLES.WAREHOUSE_OPS]),
  materialRequestsController.cancel.bind(materialRequestsController)
);

export default router;
