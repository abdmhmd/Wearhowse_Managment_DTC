import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ResponseOptions {
  statusCode?: number;
  message?: string;
}

export function sendData<T>(res: Response, data: T | null, options?: ResponseOptions): Response {
  const body: Record<string, any> = { success: true, data };
  if (options?.message) body.message = options.message;
  return res.status(options?.statusCode ?? 200).json(body);
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: PaginationMeta,
  options?: ResponseOptions
): Response {
  const data: PaginatedData<T> = { items, pagination };
  return sendData(res, data, options);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  code?: string,
  details?: Record<string, any>,
  requestId?: string
) {
  const errorBody: Record<string, any> = { message };
  if (code) errorBody.code = code;
  if (details) errorBody.details = details;
  const reqId = requestId || (res.req as any)?.id || (res.req as any)?.requestId;
  if (reqId) errorBody.requestId = reqId;
  return res.status(statusCode).json({ success: false, error: errorBody });
}
