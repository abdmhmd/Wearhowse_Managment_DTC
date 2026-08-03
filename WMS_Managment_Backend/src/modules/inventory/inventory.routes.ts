import { Router } from 'express';
import { authenticate, authorize, ROLES } from '../../middlewares/auth.middleware';
import { inventoryController } from './inventory.controller';

const router = Router();
router.use(authenticate);

// POST /api/inventory/sessions — open a new counting session
router.post('/sessions', authorize([...ROLES.MANAGEMENT]), (req, res, next) => inventoryController.openSession(req, res, next));

// GET /api/inventory/sessions/:id — get session with counts
router.get('/sessions/:id', authorize([...ROLES.WAREHOUSE_OPS, 'accountant']), (req, res, next) => inventoryController.getSession(req, res, next));

// POST /api/inventory/sessions/:id/count — record a physical count for one item
router.post('/sessions/:id/count', authorize([...ROLES.WAREHOUSE_OPS]), (req, res, next) => inventoryController.recordCount(req, res, next));

// POST /api/inventory/sessions/:id/close — close session and apply ADJ variances
router.post('/sessions/:id/close', authorize([...ROLES.MANAGEMENT]), (req, res, next) => inventoryController.closeSession(req, res, next));

export default router;
