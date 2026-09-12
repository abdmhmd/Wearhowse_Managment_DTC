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

// POST /api/purchase-orders/:id/confirm-transfer — approve the D8 auto-created
// transfer (draft TRF) so the received stock moves main -> sub warehouse.
// Reuses purchase-orders:receive (the transfer gate); the old
// purchase-orders:allocate / purchase-orders:transfer permissions were
// removed in migration 046.
router.post(
  '/:id/confirm-transfer',
  authorize('purchase-orders:receive'),
  purchaseOrdersController.confirmTransfer.bind(purchaseOrdersController)
);

export default router;
