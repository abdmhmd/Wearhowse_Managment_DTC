import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const incomingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  const requestId = (typeof incomingId === 'string' && incomingId.trim().length > 0)
    ? incomingId.trim()
    : randomUUID();

  (req as any).id = requestId;
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
      'HTTP',
      { requestId, method: req.method, path: req.originalUrl, statusCode: res.statusCode, duration }
    );
  });

  next();
}
