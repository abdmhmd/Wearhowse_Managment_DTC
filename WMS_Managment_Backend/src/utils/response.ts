import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendSuccess(
  res: Response,
  data: any,
  messageOrStatusCode?: string | number,
  statusCodeOrPagination?: number | PaginationMeta,
  pagination?: PaginationMeta
) {
  const body: Record<string, any> = { success: true, data };
  let statusCode = 200;

  if (typeof messageOrStatusCode === 'string') {
    body.message = messageOrStatusCode;
    if (typeof statusCodeOrPagination === 'number') {
      statusCode = statusCodeOrPagination;
    } else if (typeof statusCodeOrPagination === 'object') {
      body.pagination = statusCodeOrPagination;
    }
    if (pagination) body.pagination = pagination;
  } else if (typeof messageOrStatusCode === 'number') {
    statusCode = messageOrStatusCode;
    if (typeof statusCodeOrPagination === 'object') {
      body.pagination = statusCodeOrPagination;
    }
  }

  return res.status(statusCode).json(body);
}

export function sendError(res: Response, message: string, statusCode = 500, code?: string, details?: Record<string, any>) {
  const errorBody: Record<string, any> = { message };
  if (code) errorBody.code = code;
  if (details) errorBody.details = details;
  return res.status(statusCode).json({ success: false, error: errorBody });
}
