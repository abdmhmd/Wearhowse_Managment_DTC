import { pool } from '../../config/database';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'REFRESH'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_ACTIVATED'
  | 'USER_ROLE_CHANGED'
  | 'USER_PASSWORD_CHANGED'
  | 'WAREHOUSE_ASSIGNED'
  | 'WAREHOUSE_REVOKED'
  | 'TRANSACTION_CREATED'
  | 'TRANSACTION_APPROVED'
  | 'REQUEST_CREATED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_FORWARDED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_ISSUED'
  | 'REQUEST_CANCELLED'
  | 'CUSTODY_RETURNED'
  | 'INVENTORY_SESSION_OPENED'
  | 'INVENTORY_SESSION_CLOSED'
  | 'ITEM_CREATED'
  | 'ITEM_UPDATED'
  | 'ITEM_DELETED'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_CLOSED'
  | 'PROJECT_CANCELLED'
  | 'PROJECT_STUDENTS_UPDATED'
  | 'PROJECT_DELETED'
  | 'SETTINGS_UPDATED'
  | 'GENERIC';

export interface AuditEntry {
  user_id: number | null;
  action: AuditAction;
  resource: string;
  resource_id?: string | number | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

/** Fire-and-forget audit write; failures are logged but never throw. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.user_id,
        entry.action,
        entry.resource,
        entry.resource_id != null ? String(entry.resource_id) : null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ip_address || null,
        entry.user_agent || null,
      ]
    );
  } catch (error) {
    const { logger } = require('../../utils/logger') as typeof import('../../utils/logger');
    logger.error(`Failed to write audit log entry: ${(error as Error).message}`, 'Audit');
  }
}
