import { Request, Response, NextFunction } from 'express';
import { usersRepository } from '../users/users.repository';
import { ACTIVE_ROLES } from '../users/users.repository';
import { pool } from '../../config/database';
import { verifyPassword } from '../../utils/crypto';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, hashToken } from '../../utils/jwt';
import { sendData } from '../../utils/response';
import { loginSchema } from './auth.validator';
import { AuthError, ValidationError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { loadAuthContext } from '../authorization/authorization.service';
import { writeAudit } from '../authorization/audit.service';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';

export class AuthController {
  async login(req: Request, _res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const { username, password } = parsed.data;
      logger.debug(`Login attempt for username "${username}"`, 'Auth');

      const user = await usersRepository.findByUsername(username);
      if (!user) {
        logger.debug(`Login rejected: no user found for username "${username}"`, 'Auth');
        throw new AuthError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
      }
      if (!user.is_active) {
        logger.debug(`Login rejected: account "${username}" is inactive`, 'Auth');
        throw new AuthError('Account is disabled. Contact an administrator.', 'AUTH_ACCOUNT_DISABLED');
      }
      if (!ACTIVE_ROLES.includes(user.role)) {
        logger.debug(`Login rejected: role "${user.role}" of "${username}" is deactivated`, 'Auth');
        throw new AuthError(
          'Your role is no longer active. Contact an administrator.',
          'AUTH_ROLE_DISABLED'
        );
      }

      const isPasswordValid = await verifyPassword(password, user.password_hash);
      logger.debug(`Login password verification for "${username}": ${isPasswordValid}`, 'Auth');
      if (!isPasswordValid) {
        await writeAudit({
          user_id: user.id,
          action: 'LOGIN_FAILED',
          resource: 'auth',
          details: { username },
          ip_address: req.ip,
          user_agent: req.headers?.['user-agent'] ?? null,
        });
        throw new AuthError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
      }

      const payload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        department_id: user.department_id ?? null,
        token_version: user.token_version,
      };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, hashToken(refreshToken), expiresAt]
      );

      await writeAudit({
        user_id: user.id,
        action: 'LOGIN',
        resource: 'auth',
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });

      sendData(_res, {
        token: accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          department_id: user.department_id ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, _res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) throw new AuthError('Refresh token required', 'AUTH_TOKEN_INVALID');

      const payload = verifyRefreshToken(refreshToken);
      if (!payload) throw new AuthError('Invalid or expired refresh token', 'AUTH_TOKEN_INVALID');

      const user = await usersRepository.findByUsername(payload.username);
      if (!user) throw new AuthError('Account no longer exists', 'AUTH_TOKEN_INVALID');
      if (!user.is_active) {
        throw new AuthError('Account is disabled. Contact an administrator.', 'AUTH_ACCOUNT_DISABLED');
      }
      if (!ACTIVE_ROLES.includes(user.role)) {
        throw new AuthError(
          'Your role is no longer active. Contact an administrator.',
          'AUTH_ROLE_DISABLED'
        );
      }
      if (payload.token_version !== user.token_version) {
        throw new AuthError('Session revoked. Please sign in again.', 'AUTH_TOKEN_INVALID');
      }

      const tokenHash = hashToken(refreshToken);
      const result = await pool.query(
        'SELECT id, revoked_at FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2',
        [tokenHash, payload.userId]
      );

      if (result.rows.length === 0 || result.rows[0].revoked_at) {
        throw new AuthError('Refresh token has been revoked', 'AUTH_TOKEN_INVALID');
      }

      await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);

      const newPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        department_id: user.department_id ?? null,
        token_version: user.token_version,
      };
      const newAccessToken = generateAccessToken(newPayload);
      const newRefreshToken = generateRefreshToken(newPayload);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, hashToken(newRefreshToken), expiresAt]
      );

      await writeAudit({
        user_id: user.id,
        action: 'REFRESH',
        resource: 'auth',
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });

      sendData(_res, {
        token: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, _res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        const tokenHash = hashToken(refreshToken);
        await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
      }
      await writeAudit({
        user_id: (req as AuthenticatedRequest).user?.userId ?? null,
        action: 'LOGOUT',
        resource: 'auth',
        ip_address: req.ip,
        user_agent: req.headers?.['user-agent'] ?? null,
      });
      sendData(_res, null, { message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  /** Returns the caller's full authorization context. */
  async me(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AuthError('Authentication required', 'AUTH_UNAUTHORIZED');
      const context = await loadAuthContext(req.user.userId);
      if (!context) throw new AuthError('Account no longer exists', 'AUTH_TOKEN_INVALID');

      sendData(_res, {
        user: {
          id: context.id,
          username: context.username,
          full_name: context.full_name,
          role: context.role,
          department_id: context.department_id,
          permissions: context.permissions,
          warehouses: context.warehouses,
          warehouse_ids: context.warehouse_ids,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
export const authController = new AuthController();
