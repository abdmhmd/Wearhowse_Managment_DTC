import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { stockMovementsController } from './stock-movements.controller';
const router = Router();

router.use(authenticate);

router.get('/', stockMovementsController.getAll);
router.get('/item/:itemId', stockMovementsController.getByItemId);
router.get('/transaction/:transactionId', stockMovementsController.getByTransactionId);
export default router;