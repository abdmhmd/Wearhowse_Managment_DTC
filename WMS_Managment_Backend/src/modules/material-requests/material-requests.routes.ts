import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { materialRequestsController } from './material-requests.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/requests — list requests (scoped by role automatically in controller)
router.get(
  '/',
  authorize('requests:view'),
  materialRequestsController.getAll.bind(materialRequestsController)
);

// GET /api/requests/catalog — request-creation catalog (department-scoped
// warehouses / items + units) for users with requests:create. MUST be
// registered before GET /:id so 'catalog' is not captured as a numeric id.
router.get(
  '/catalog',
  authorize('requests:create'),
  materialRequestsController.getCatalog.bind(materialRequestsController)
);

// GET /api/requests/:id — view single request
router.get(
  '/:id',
  authorize('requests:view'),
  materialRequestsController.getById.bind(materialRequestsController)
);

// POST /api/requests — create new request (warehouse_manager or system_admin;
// department_manager is the approval layer and cannot create requests)
router.post(
  '/',
  authorize('requests:create'),
  materialRequestsController.create.bind(materialRequestsController)
);

// PATCH /api/requests/:id/approve — department manager approves (dept_approved)
// or system admin approves a forwarded request (admin_approved)
router.patch(
  '/:id/approve',
  authorize('requests:approve'),
  materialRequestsController.approve.bind(materialRequestsController)
);

// PATCH /api/requests/:id/forward — department manager forwards the
// dept-approved request to the warehouse admin for issuance
router.patch(
  '/:id/forward',
  authorize('requests:forward'),
  materialRequestsController.forward.bind(materialRequestsController)
);

// PATCH /api/requests/:id/reject — admin rejects a forwarded request
router.patch(
  '/:id/reject',
  authorize('requests:reject'),
  materialRequestsController.reject.bind(materialRequestsController)
);

// POST /api/requests/:id/issue — admin issues the LN voucher
router.post(
  '/:id/issue',
  authorize('requests:issue'),
  materialRequestsController.issue.bind(materialRequestsController)
);

// PATCH /api/requests/:id/cancel — requester or manager cancels
router.patch(
  '/:id/cancel',
  authorize('requests:cancel'),
  materialRequestsController.cancel.bind(materialRequestsController)
);

export default router;
