import { Router } from 'express';
import { authenticate, authorize, ROLES } from '../../middlewares/auth.middleware';
import { stockMovementsController } from './stock-movements.controller';
const router = Router();

router.use(authenticate);

// Only management and accountants can view stock movement history
router.get('/', authorize([...ROLES.MANAGEMENT, 'accountant']), stockMovementsController.getAll);
router.get('/item/:itemId', authorize([...ROLES.WAREHOUSE_OPS, 'accountant']), stockMovementsController.getByItemId);
router.get('/transaction/:transactionId', authorize([...ROLES.WAREHOUSE_OPS, 'accountant']), stockMovementsController.getByTransactionId);
export default router;