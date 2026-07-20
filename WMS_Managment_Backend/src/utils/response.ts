import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendSuccess(res: Response, data: any, statusCode = 200, pagination?: PaginationMeta) {
  const body: Record<string, any> = { success: true, data };
  if (pagination) body.pagination = pagination;
  return res.status(statusCode).json(body);
}

export function sendError(res: Response, message: string, statusCode = 500, code?: string, details?: Record<string, any>) {
  const errorBody: Record<string, any> = { message };
  if (code) errorBody.code = code;
  if (details) errorBody.details = details;
  return res.status(statusCode).json({ success: false, error: errorBody });
}
