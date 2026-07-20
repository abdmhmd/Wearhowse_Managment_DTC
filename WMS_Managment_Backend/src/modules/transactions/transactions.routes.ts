import { Router } from 'express';
import { transactionsController } from './transactions.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';

const router = Router();

// Protect all transaction routes
router.use(authenticate);

// Get all transactions
router.get('/', transactionsController.getAll);

// Get a single transaction by ID
router.get('/:id', transactionsController.getById);

// Create a draft transaction (any authenticated user can create a draft in this basic setup, 
// but realistically only storekeeper, warehouse_manager, system_admin)
router.post('/', authorize(['storekeeper', 'warehouse_manager', 'system_admin']), transactionsController.createDraft);

// Approve a transaction (only managers and admins)
router.post('/:id/approve', authorize(['warehouse_manager', 'system_admin']), transactionsController.approve);

export default router;
