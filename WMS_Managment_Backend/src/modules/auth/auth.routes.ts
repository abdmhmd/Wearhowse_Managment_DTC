import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts. Please try again later.',
      code: 'TOO_MANY_REQUESTS',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 refresh/logout requests per 15 minutes
  message: {
    success: false,
    error: {
      message: 'Too many token requests. Please try again later.',
      code: 'TOO_MANY_REQUESTS',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, authController.login);
router.post('/refresh', tokenLimiter, authController.refresh);
router.post('/logout', tokenLimiter, authController.logout);

export default router;
