import { Router } from 'express';
import { authenticate, authorize, authorizeAny } from '../../middlewares/auth.middleware';
import { purchaseRequestsController } from './purchase-requests.controller';
import { PERMISSIONS } from '../authorization/permissions';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/purchase-requests — list (scoped: view_own = own, view = department/admin by scope)
router.get(
  '/',
  authorizeAny(PERMISSIONS.PURCHASE_REQUESTS_VIEW, PERMISSIONS.PURCHASE_REQUESTS_VIEW_OWN),
  purchaseRequestsController.getAll.bind(purchaseRequestsController)
);

// GET /api/purchase-requests/:id — detail (scope-checked in service)
router.get(
  '/:id',
  authorizeAny(PERMISSIONS.PURCHASE_REQUESTS_VIEW, PERMISSIONS.PURCHASE_REQUESTS_VIEW_OWN),
  purchaseRequestsController.getById.bind(purchaseRequestsController)
);

// POST /api/purchase-requests — create (sub_warehouse_manager)
router.post(
  '/',
  authorize(PERMISSIONS.PURCHASE_REQUESTS_CREATE),
  purchaseRequestsController.create.bind(purchaseRequestsController)
);

// PATCH /api/purchase-requests/:id/cancel — creator-only, pending only
router.patch(
  '/:id/cancel',
  authorize(PERMISSIONS.PURCHASE_REQUESTS_CANCEL),
  purchaseRequestsController.cancel.bind(purchaseRequestsController)
);

// PATCH /api/purchase-requests/:id/approve-dept — dept manager, pending -> dept_approved
router.patch(
  '/:id/approve-dept',
  authorize(PERMISSIONS.PURCHASE_REQUESTS_APPROVE_DEPT),
  purchaseRequestsController.approveDept.bind(purchaseRequestsController)
);

// PATCH /api/purchase-requests/:id/reject-dept — dept manager, pending|dept_approved -> rejected
router.patch(
  '/:id/reject-dept',
  authorize(PERMISSIONS.PURCHASE_REQUESTS_REJECT_DEPT),
  purchaseRequestsController.rejectDept.bind(purchaseRequestsController)
);

// PATCH /api/purchase-requests/:id/approve-admin — admin; dept_approved -> admin_approved + AUTO-PO
router.patch(
  '/:id/approve-admin',
  authorize(PERMISSIONS.PURCHASE_REQUESTS_APPROVE_ADMIN),
  purchaseRequestsController.approveAdmin.bind(purchaseRequestsController)
);

// PATCH /api/purchase-requests/:id/reject-admin — admin; dept_approved -> rejected
router.patch(
  '/:id/reject-admin',
  authorize(PERMISSIONS.PURCHASE_REQUESTS_REJECT_ADMIN),
  purchaseRequestsController.rejectAdmin.bind(purchaseRequestsController)
);

export default router;