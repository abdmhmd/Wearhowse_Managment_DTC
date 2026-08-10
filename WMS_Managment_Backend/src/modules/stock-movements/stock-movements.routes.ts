import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { stockMovementsController } from './stock-movements.controller';
const router = Router();

router.use(authenticate);

// Only system_admin can view full stock movement history
router.get('/', authorize('stock-movements:view-all'), stockMovementsController.getAll);
router.get('/item/:itemId', authorize('stock-movements:view'), stockMovementsController.getByItemId);
router.get('/transaction/:transactionId', authorize('stock-movements:view'), stockMovementsController.getByTransactionId);
export default router;