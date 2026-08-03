import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';
import { AuthError, ForbiddenError } from '../utils/AppError';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

/** Convenience role groupings for use in route-level authorize() calls */
export const ROLES = {
  ALL_STAFF: ['system_admin', 'warehouse_manager', 'storekeeper', 'accountant', 'department_manager', 'viewer'],
  WAREHOUSE_OPS: ['system_admin', 'warehouse_manager', 'storekeeper'],
  MANAGEMENT: ['system_admin', 'warehouse_manager'],
  ADMINS_ONLY: ['system_admin'],
  CAN_REQUEST: ['system_admin', 'warehouse_manager', 'department_manager'],
  READ_ONLY: ['system_admin', 'warehouse_manager', 'storekeeper', 'accountant', 'department_manager', 'viewer'],
  CAN_VIEW_REPORTS: ['system_admin', 'warehouse_manager', 'accountant'],
} as const;

export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthError('Authentication required', 'AUTH_UNAUTHORIZED'));
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next(new AuthError('Invalid authorization token format', 'AUTH_TOKEN_INVALID'));
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return next(new AuthError('Invalid or expired token', 'AUTH_TOKEN_INVALID'));
  }

  req.user = decoded;
  next();
}

export function authorize(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthError('Authentication required', 'AUTH_UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }

    next();
  };
}
