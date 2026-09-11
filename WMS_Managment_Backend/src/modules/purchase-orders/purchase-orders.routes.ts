import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { purchaseOrdersController } from './purchase-orders.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Purchase order lifecycle ────────────────────────────────────────────────

// GET /api/purchase-orders — list (scope-filtered: admin all, WM own main warehouses)
router.get(
  '/',
  authorize('purchase-orders:view'),
  purchaseOrdersController.getAll.bind(purchaseOrdersController)
);

// POST /api/purchase-orders — create draft
router.post(
  '/',
  authorize('purchase-orders:create'),
  purchaseOrdersController.create.bind(purchaseOrdersController)
);

// GET /api/purchase-orders/:id — detail incl. lines + allocations (scope-checked)
router.get(
  '/:id',
  authorize('purchase-orders:view'),
  purchaseOrdersController.getById.bind(purchaseOrdersController)
);

// PATCH /api/purchase-orders/:id — edit draft only
router.patch(
  '/:id',
  authorize('purchase-orders:update'),
  purchaseOrdersController.update.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/:id/approve — draft -> approved
router.post(
  '/:id/approve',
  authorize('purchase-orders:approve'),
  purchaseOrdersController.approve.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/:id/cancel
router.post(
  '/:id/cancel',
  authorize('purchase-orders:cancel'),
  purchaseOrdersController.cancel.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/:id/close — received -> closed
router.post(
  '/:id/close',
  authorize('purchase-orders:update'),
  purchaseOrdersController.close.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/:id/receive — RV voucher into the main warehouse
router.post(
  '/:id/receive',
  authorize('purchase-orders:receive'),
  purchaseOrdersController.receive.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/:id/confirm-receive — confirm physical receipt from supplier
router.post(
  '/:id/confirm-receive',
  authorize('purchase-orders:receive'),
  purchaseOrdersController.confirmReceive.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/:id/allocations — reserve received stock for a destination
router.post(
  '/:id/allocations',
  authorize('purchase-orders:allocate'),
  purchaseOrdersController.allocate.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/allocations/:id/transfer — move allocated stock
// Registered AFTER '/:id/...' routes is fine because Express matches in order;
// this path has a distinct prefix ('allocations') so no shadowing occurs.
router.post(
  '/allocations/:id/transfer',
  authorize('purchase-orders:transfer'),
  purchaseOrdersController.transfer.bind(purchaseOrdersController)
);

// DELETE /api/purchase-orders/allocations/:id — cancel/release allocated stock
router.delete(
  '/allocations/:id',
  authorize('purchase-orders:allocate'),
  purchaseOrdersController.cancelAllocation.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/allocations/:id/cancel — cancel/release allocated stock
router.post(
  '/allocations/:id/cancel',
  authorize('purchase-orders:allocate'),
  purchaseOrdersController.cancelAllocation.bind(purchaseOrdersController)
);

// POST /api/purchase-orders/allocations/:id/confirm-transfer — confirm transfer movement
router.post(
  '/allocations/:id/confirm-transfer',
  authorize('purchase-orders:transfer'),
  purchaseOrdersController.confirmTransfer.bind(purchaseOrdersController)
);

export default router;
