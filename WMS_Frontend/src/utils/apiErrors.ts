import i18n from '@/i18n';
import type { TFunction } from 'i18next';

/**
 * Central API error mapper.
 *
 * Backend errors arrive as:
 *   { error: { code, message, details } }
 *
 * This module maps stable machine-readable error codes (with HTTP-status and
 * details-based fallbacks) to user-friendly i18n messages. Raw backend
 * messages are NEVER shown to the user — unknown errors get a safe generic
 * message; the raw error is only logged to the console in development.
 */

export interface MappedApiError {
  key: string;
  params?: Record<string, unknown>;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: Record<string, any>;
}

function extract(error: any): { status: number; payload: ApiErrorPayload } {
  const status: number = error?.response?.status ?? 0;
  const data = error?.response?.data ?? {};
  return {
    status,
    payload: {
      code: data?.error?.code,
      message: data?.error?.message ?? data?.message,
      details: data?.error?.details,
    },
  };
}

function num(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

/**
 * Map an axios/API error to a translation key + interpolation params.
 * Order of resolution: backend error code → HTTP status → generic fallback.
 */
export function mapApiError(error: any): MappedApiError {
  const { status, payload } = extract(error);
  const d = payload.details ?? {};
  const qty = { available: num(d.available), requested: num(d.requested ?? d.required ?? d.attempted) };

  switch (payload.code) {
    // ── shared ──────────────────────────────────────────────────────────────
    case 'INSUFFICIENT_STOCK':
      return qty.available !== undefined && qty.requested !== undefined
        ? { key: 'pages.materialRequests.errors.insufficientStockWithQty', params: qty }
        : { key: 'pages.materialRequests.errors.insufficientStock' };
    case 'INVALID_REQUEST_STATUS':
      return { key: 'pages.materialRequests.errors.invalidStatus' };
    case 'INVALID_PURCHASE_ORDER_STATUS':
      return { key: 'pages.purchaseOrders.errors.invalidStatus' };
    case 'NO_MAIN_WAREHOUSE':
      return { key: 'pages.materialRequests.errors.noMainWarehouse' };
    case 'MAIN_WAREHOUSE_DESTINATION':
      return { key: 'pages.materialRequests.errors.mainWarehouseDestination' };
    case 'MAIN_WAREHOUSE_REQUIRED':
      return { key: 'pages.purchaseOrders.errors.mainWarehouseRequired' };
    case 'WAREHOUSE_SCOPE_ERROR':
      return { key: 'pages.materialRequests.errors.warehouseScope' };
    case 'ITEM_NOT_FOUND':
      return { key: 'pages.materialRequests.errors.invalidItem' };
    case 'UNIT_NOT_VALID_FOR_ITEM':
      return { key: 'pages.materialRequests.errors.invalidUnit' };

    // ── purchase orders ─────────────────────────────────────────────────────
    case 'RECEIVE_EXCEEDS_ORDERED':
      return { key: 'pages.purchaseOrders.errors.exceedsOrdered', params: qty.requested !== undefined ? { attempted: qty.requested } : undefined };
    case 'NO_TRANSFER_DESTINATION':
      return { key: 'pages.purchaseOrders.errors.noTransferDestination' };
    case 'AMBIGUOUS_TRANSFER_DESTINATION':
      return { key: 'pages.purchaseOrders.errors.ambiguousTransferDestination' };
    case 'NO_LINKED_TRANSFER':
      return { key: 'pages.purchaseOrders.errors.noLinkedTransfer' };
    case 'LINKED_TRANSFER_ALREADY_CONFIRMED':
      return { key: 'pages.purchaseOrders.errors.linkedTransferAlreadyConfirmed' };
    case 'PURCHASE_ORDER_NOT_FOUND':
      return { key: 'pages.purchaseOrders.errors.notFound' };

    // ── material requests ───────────────────────────────────────────────────
    case 'REQUEST_NOT_FOUND':
      return { key: 'pages.materialRequests.errors.notFound' };

    // ── purchase requests ───────────────────────────────────────────────────
    case 'PURCHASE_REQUEST_NOT_FOUND':
      return { key: 'pages.purchaseRequests.errors.notFound' };
    case 'PURCHASE_REQUEST_INVALID_STATUS':
      return { key: 'pages.purchaseRequests.errors.invalidStatus' };
    case 'PURCHASE_REQUEST_ALREADY_PROCESSED':
      return { key: 'pages.purchaseRequests.errors.alreadyProcessed' };
    case 'WAREHOUSE_DEPARTMENT_MISMATCH':
      return { key: 'pages.purchaseRequests.errors.warehouseDepartmentMismatch' };
    case 'ITEM_INVALID':
      return { key: 'pages.purchaseRequests.errors.invalidItem' };
    case 'UNIT_INVALID':
      return { key: 'pages.purchaseRequests.errors.invalidUnit' };
    case 'NO_DEPARTMENT':
      return { key: 'pages.purchaseRequests.errors.noDepartment' };

    // ── auth ──────────────────────────────────────────────────────────────
    case 'AUTH_INVALID_CREDENTIALS':
      return { key: 'auth.login.errors.AUTH_INVALID_CREDENTIALS' };
    case 'AUTH_ACCOUNT_DISABLED':
      return { key: 'auth.login.errors.AUTH_ACCOUNT_DISABLED' };
    case 'AUTH_ROLE_DISABLED':
      return { key: 'auth.login.errors.AUTH_ROLE_DISABLED' };
    case 'AUTH_RATE_LIMITED':
      return { key: 'auth.login.errors.AUTH_RATE_LIMITED' };
  }

  // HTTP-status fallbacks for codes without a specific business mapping.
  if (status === 403) return { key: 'errors.forbidden' };
  if (status === 404) return { key: 'errors.notFound' };
  if (status === 401) return { key: 'errors.unauthorized' };

  return { key: 'errors.unexpected' };
}

/** Convenience helper: returns the fully translated, user-safe message. */
export function getApiErrorMessage(error: any): string {
  const { key, params } = mapApiError(error);
  return (i18n.t as TFunction)(key, params ?? {});
}

/** True when the mapper has a specific (non-generic) mapping for this error. */
export function isKnownBusinessError(error: any): boolean {
  const { key } = mapApiError(error);
  return !['errors.unexpected', 'errors.notFound', 'errors.forbidden', 'errors.unauthorized'].includes(key);
}
