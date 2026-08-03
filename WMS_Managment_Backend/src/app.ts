import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { sendSuccess, sendError } from './utils/response';
import { AppError } from './utils/AppError';
import { env } from './utils/env';
import { logger } from './utils/logger';
import { requestLogger } from './middlewares/logger.middleware';
import { languageMiddleware } from './middlewares/language.middleware';
import swaggerRoutes from './docs/swagger';
import authRoutes from './modules/auth/auth.routes';
import categoriesRoutes from './modules/categories/categories.routes';
import unitsRoutes from './modules/units/units.routes';
import suppliersRoutes from './modules/suppliers/suppliers.routes';
import departmentsRoutes from './modules/departments/departments.routes';
import warehousesRoutes from './modules/warehouses/warehouses.routes';
import usersRoutes from './modules/users/users.routes';
import itemsRoutes from './modules/items/items.routes';
import unitConversionsRoutes from './modules/unit-conversions/unit-conversions.routes';
import transactionsRoutes from './modules/transactions/transactions.routes';
import stockMovementsRoutes from './modules/stock-movements/stock-movements.routes';
import reportsRoutes from './modules/reports/reports.routes';
import settingsRoutes from './modules/settings/settings.routes';
import materialRequestsRoutes from './modules/material-requests/material-requests.routes';
import alertsRoutes from './modules/alerts/alerts.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import batchesRoutes from './modules/batches/batches.routes';
import projectsRoutes from './modules/projects/projects.routes';
import custodiesRoutes from './modules/custodies/custodies.routes';

const app: Application = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS }));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);
app.use(languageMiddleware);

// Rate limiting for API routes only (excluding /health)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/warehouses', warehousesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/unit-conversions', unitConversionsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/stock-movements', stockMovementsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/requests', materialRequestsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/batches', batchesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/custodies', custodiesRoutes);

import { testConnection } from './config/database';

app.get('/health', async (_req: Request, res: Response) => {
  const isDbHealthy = await testConnection();
  if (!isDbHealthy) {
    return sendError(res, 'Database connection error', 503, 'SERVICE_UNAVAILABLE');
  }
  sendSuccess(res, { status: 'healthy', database: 'connected', timestamp: new Date() });
});

app.use('/api', swaggerRoutes);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return sendError(res, err.message, err.status, err.code, err.details);
  }
  logger.error('Unhandled error', 'GlobalHandler', { error: err.message, stack: err.stack });
  return sendError(res, 'Internal Server Error', 500, 'INTERNAL_SERVER_ERROR');
});

export default app;
