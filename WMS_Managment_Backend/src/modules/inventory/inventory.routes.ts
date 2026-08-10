import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { inventoryController } from './inventory.controller';

const router = Router();
router.use(authenticate);

// POST /api/inventory/sessions — open a new counting session
router.post('/sessions', authorize('inventory:session:open'), (req, res, next) => inventoryController.openSession(req, res, next));

// GET /api/inventory/sessions/:id — get session with counts
router.get('/sessions/:id', authorize('inventory:session:view'), (req, res, next) => inventoryController.getSession(req, res, next));

// POST /api/inventory/sessions/:id/count — record a physical count for one item
router.post('/sessions/:id/count', authorize('inventory:count:record'), (req, res, next) => inventoryController.recordCount(req, res, next));

// POST /api/inventory/sessions/:id/close — close session and apply ADJ variances
router.post('/sessions/:id/close', authorize('inventory:session:close'), (req, res, next) => inventoryController.closeSession(req, res, next));

export default router;
