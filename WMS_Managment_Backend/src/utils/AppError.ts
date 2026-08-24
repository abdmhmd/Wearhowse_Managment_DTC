export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, any>;
  public readonly isOperational: boolean;

  constructor(message: string, status = 400, code?: string, details?: Record<string, any>) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', code?: string, details?: Record<string, any>) {
    super(`${resource} not found`, 404, code || 'NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>, code?: string) {
    super(message, 400, code || 'VALIDATION_ERROR', details);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required', code?: string, details?: Record<string, any>) {
    super(message, 401, code || 'AUTH_ERROR', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied: insufficient permissions', details?: Record<string, any>) {
    super(message, 403, 'AUTH_FORBIDDEN', details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code?: string, details?: Record<string, any>) {
    super(message, 409, code || 'CONFLICT', details);
  }
}
