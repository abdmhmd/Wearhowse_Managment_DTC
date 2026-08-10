import { Router } from 'express';
import { transactionsController } from './transactions.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';

const router = Router();

// Protect all transaction routes
router.use(authenticate);

// Get all transactions
router.get('/', authorize('transactions:view'), transactionsController.getAll);

// Get a single transaction by ID
router.get('/:id', authorize('transactions:view'), transactionsController.getById);

// Create a draft transaction (system_admin only)
router.post('/', authorize('transactions:create'), transactionsController.createDraft);

// Approve a transaction (system_admin only)
router.post('/:id/approve', authorize('transactions:approve'), transactionsController.approve);

export default router;
