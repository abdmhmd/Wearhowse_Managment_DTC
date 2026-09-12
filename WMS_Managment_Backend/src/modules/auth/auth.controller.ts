import { Request, Response, NextFunction } from 'express';
import { usersRepository } from '../users/users.repository';
import { ACTIVE_ROLES } from '../users/users.repository';
import { pool } from '../../config/database';
import { verifyPassword } from '../../utils/crypto';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, hashToken } from '../../utils/jwt';
import { sendData } from '../../utils/response';
import { loginSchema } from './auth.validator';
import { AuthError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { loadAuthContext } from '../authorization/authorization.service';
import { writeAudit } from '../authorization/audit.service';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { loginAttempts } from './loginAttempts';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Dummy bcrypt hash used ONLY for timing equalization: when the username does
 * not exist the server still runs a bcrypt compare against this fixed hash so
 * the response time matches the wrong-password path — nobody can tell whether
 * a username exists by measuring latency.
 */
const DUMMY_TIMING_HASH = '$2b$10$TS011iN3//m7y0sinqGYzOFelH6p.cr5d148EW3feH66BNPCiEMHe';

/** Scoping key for the progressive-delay tracker: username + IP combined. */
const loginFailureKey = (username: string, ip?: string): string =>
  `${(username ?? '').trim().toLowerCase()}|${ip ?? 'unknown'}`;

export class AuthController {
  async login(req: Request, _res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      // Generic code for malformed credentials as well: the client validates
      // format locally, and the server must never hint at which field is wrong.
      if (!parsed.success) throw new AuthError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

      const { username, password } = parsed.data;
      const loginKey = loginFailureKey(username, req.ip);
      logger.debug(`Login attempt for username "${username}"`, 'Auth');

      // ── Unified failure pipeline ────────────────────────────────────────
      // Every failure path registers the progressive-delay streak for this
      // username+IP, waits the (progressive) response delay, then throws.
      // Success resets the streak. The helper returns `never` so TypeScript
      // keeps control-flow narrowing after each guarded branch.
      const fail = async (message: string, code: string): Promise<never> => {
        const attempt = loginAttempts.register(loginKey);
        await sleep(loginAttempts.delayFor(attempt.count));
        throw new AuthError(message, code);
      };

      const user = await usersRepository.findByUsername(username);
      if (!user) {
        // Timing equalization: run a real bcrypt compare against a fixed
        // dummy hash so an unknown username answers in the same time as a
        // wrong password, before the generic failure is raised.
        await verifyPassword(password, DUMMY_TIMING_HASH);
        logger.debug(`Login rejected: no user found for username "${username}"`, 'Auth');
        const attempt = loginAttempts.register(loginKey);
        await sleep(loginAttempts.delayFor(attempt.count));
        throw new AuthError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
      }
      if (!user.is_active) {
        logger.debug(`Login rejected: account "${username}" is inactive`, 'Auth');
        await fail('Account is disabled. Contact an administrator.', 'AUTH_ACCOUNT_DISABLED');
      }
      if (!ACTIVE_ROLES.includes(user.role)) {
        logger.debug(`Login rejected: role "${user.role}" of "${username}" is deactivated`, 'Auth');
        await fail(
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
        await fail('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
      }

      // ── Success: clear the failure streak for this username+IP ───────────
      loginAttempts.reset(loginKey);

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
          department_name_ar: context.department_name_ar,
          department_name_en: context.department_name_en,
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
