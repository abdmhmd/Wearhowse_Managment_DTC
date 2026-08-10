import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AuthError, ForbiddenError } from '../utils/AppError';
import {
  loadAuthContext,
  type AuthUserContext,
} from '../modules/authorization/authorization.service';
import { PERMISSIONS, type PermissionCode } from '../modules/authorization/permissions';

export interface AuthenticatedRequest extends Request {
  user?: AuthUserContext;
}

/**
 * Backward-compatible shape kept for any code reading `req.user!.id`
 * (the context carries both `id` and `userId`).
 */

/**
 * Authenticates the request by verifying the Bearer token and loading the
 * FULL authorization context (role, department, permissions, assigned
 * warehouses) fresh from the database on every request.
 *
 * The JWT is treated as identity only. If the stored `token_version` no
 * longer matches the version embedded in the token, the session is stale and
 * the user must re-authenticate (this happens on role/status/password
 * changes, effectively revoking active sessions).
 */
export async function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthError('Authentication required', 'AUTH_UNAUTHORIZED'));
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next(new AuthError('Invalid authorization token format', 'AUTH_TOKEN_INVALID'));
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return next(new AuthError('Invalid or expired token', 'AUTH_TOKEN_INVALID'));
  }

  const context = await loadAuthContext(decoded.userId);
  if (!context) {
    return next(new AuthError('Account no longer exists', 'AUTH_TOKEN_INVALID'));
  }
  if (!context.is_active) {
    return next(new AuthError('Account is disabled. Contact an administrator.', 'AUTH_ACCOUNT_DISABLED'));
  }
  if (
    decoded.token_version !== undefined &&
    context.token_version !== decoded.token_version
  ) {
    return next(new AuthError('Session revoked. Please sign in again.', 'AUTH_TOKEN_INVALID'));
  }

  req.user = context;
  next();
}

/** Guards a route with a single required permission. */
export function authorize(permission: PermissionCode | string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthError('Authentication required', 'AUTH_UNAUTHORIZED'));
    }
    if (!req.user.permissions.includes(permission)) {
      return next(new ForbiddenError());
    }
    next();
  };
}

/** Guards a route with ANY-of permission set (first match wins). */
export function authorizeAny(...permissions: (PermissionCode | string)[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthError('Authentication required', 'AUTH_UNAUTHORIZED'));
    }
    if (!permissions.some((p) => req.user!.permissions.includes(p))) {
      return next(new ForbiddenError());
    }
    next();
  };
}

/** Convenience reference so existing imports of ROLES keep resolving. */
export const ROLES = PERMISSIONS;
