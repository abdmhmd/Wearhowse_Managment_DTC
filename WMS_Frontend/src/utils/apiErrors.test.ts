import { describe, it, expect, beforeAll } from 'vitest';
import i18n from '@/i18n';
import { mapApiError, getApiErrorMessage, isKnownBusinessError } from '@/utils/apiErrors';
import en from '@/locales/en/translation.json';
import ar from '@/locales/ar/translation.json';

/**
 * Central error-mapper tests.
 *
 * Contract: raw backend messages are NEVER surfaced — the mapper resolves
 * stable error codes / HTTP statuses to i18n keys with interpolation params,
 * and unknown errors fall back to a safe generic message.
 */

function apiError(code: string | undefined, status: number, details?: Record<string, any>) {
  return { response: { status, data: { success: false, error: { code, message: 'RAW TECHNICAL MESSAGE', details } } } };
}

beforeAll(async () => { await i18n; });

describe('mapApiError — material requests', () => {
  it('maps INSUFFICIENT_STOCK with quantity params', () => {
    const m = mapApiError(apiError('INSUFFICIENT_STOCK', 400, { available: 4, required: 10 }));
    expect(m.key).toBe('pages.materialRequests.errors.insufficientStockWithQty');
    expect(m.params).toEqual({ available: '4', requested: '10' });
  });

  it('maps INSUFFICIENT_STOCK without quantities to the plain key', () => {
    expect(mapApiError(apiError('INSUFFICIENT_STOCK', 400)).key)
      .toBe('pages.materialRequests.errors.insufficientStock');
  });

  it('maps INVALID_REQUEST_STATUS', () => {
    expect(mapApiError(apiError('INVALID_REQUEST_STATUS', 400)).key)
      .toBe('pages.materialRequests.errors.invalidStatus');
  });

  it('maps AUTH_FORBIDDEN (403) to the forbidden message', () => {
    const m = mapApiError(apiError('AUTH_FORBIDDEN', 403));
    expect(m.key).toBe('errors.forbidden');
    expect(isKnownBusinessError(apiError('AUTH_FORBIDDEN', 403))).toBe(false);
  });

  it('maps WAREHOUSE_SCOPE_ERROR', () => {
    expect(mapApiError(apiError('WAREHOUSE_SCOPE_ERROR', 400)).key)
      .toBe('pages.materialRequests.errors.warehouseScope');
  });

  it('maps UNIT_NOT_VALID_FOR_ITEM defensively', () => {
    expect(mapApiError(apiError('UNIT_NOT_VALID_FOR_ITEM', 400)).key)
      .toBe('pages.materialRequests.errors.invalidUnit');
  });

  it('maps REQUEST_NOT_FOUND and 404 fallback', () => {
    expect(mapApiError(apiError('REQUEST_NOT_FOUND', 404)).key).toBe('pages.materialRequests.errors.notFound');
    expect(mapApiError({ response: { status: 404 } }).key).toBe('errors.notFound');
  });
});

describe('mapApiError — purchase orders', () => {
  it('maps RECEIVE_EXCEEDS_ORDERED', () => {
    expect(mapApiError(apiError('RECEIVE_EXCEEDS_ORDERED', 400, { attempted: 99 })).key)
      .toBe('pages.purchaseOrders.errors.exceedsOrdered');
  });

  it('maps ALLOCATE_EXCEEDS_RECEIVED', () => {
    expect(mapApiError(apiError('ALLOCATE_EXCEEDS_RECEIVED', 400)).key)
      .toBe('pages.purchaseOrders.errors.exceedsReceived');
  });

  it('maps ALLOCATE_EXCEEDS_AVAILABLE with quantities', () => {
    const m = mapApiError(apiError('ALLOCATE_EXCEEDS_AVAILABLE', 400, { available: 5, requested: 8 }));
    expect(m.key).toBe('pages.purchaseOrders.errors.insufficientAllocationWithQty');
    expect(m.params).toEqual({ available: '5', requested: '8' });
  });

  it('maps TRANSFER_EXCEEDS_ALLOCATED', () => {
    expect(mapApiError(apiError('TRANSFER_EXCEEDS_ALLOCATED', 400)).key)
      .toBe('pages.purchaseOrders.errors.exceedsAllocated');
  });

  it('maps INVALID_PURCHASE_ORDER_STATUS', () => {
    expect(mapApiError(apiError('INVALID_PURCHASE_ORDER_STATUS', 400)).key)
      .toBe('pages.purchaseOrders.errors.invalidStatus');
  });

  it('maps MAIN_WAREHOUSE_REQUIRED and INVALID_DESTINATION_WAREHOUSE', () => {
    expect(mapApiError(apiError('MAIN_WAREHOUSE_REQUIRED', 400)).key)
      .toBe('pages.purchaseOrders.errors.mainWarehouseRequired');
    expect(mapApiError(apiError('INVALID_DESTINATION_WAREHOUSE', 400)).key)
      .toBe('pages.purchaseOrders.errors.invalidDestination');
  });

  it('maps PURCHASE_ORDER_NOT_FOUND', () => {
    expect(mapApiError(apiError('PURCHASE_ORDER_NOT_FOUND', 404)).key)
      .toBe('pages.purchaseOrders.errors.notFound');
  });
});

describe('getApiErrorMessage', () => {
  it('never returns the raw backend message', () => {
    const msg = getApiErrorMessage(apiError('INSUFFICIENT_STOCK', 400, { available: 4, required: 10 }));
    expect(msg).not.toContain('RAW TECHNICAL MESSAGE');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('returns the safe generic message for unknown codes', () => {
    expect(getApiErrorMessage(apiError('SOME_NEW_CODE', 400)))
      .toBe(i18n.t('errors.unexpected'));
    expect(getApiErrorMessage(new Error('Request failed with status code 500')))
      .toBe(i18n.t('errors.unexpected'));
  });
});

describe('translations completeness', () => {
  const mrKeys = ['insufficientStock', 'insufficientStockWithQty', 'invalidItem', 'invalidUnit',
    'notFound', 'invalidStatus', 'forbidden', 'warehouseScope', 'mainWarehouseDestination', 'noMainWarehouse'];
  const poKeys = ['insufficientAllocation', 'insufficientAllocationWithQty', 'exceedsReceived',
    'exceedsAllocated', 'exceedsOrdered', 'allocationTransferred', 'notFound', 'invalidStatus',
    'forbidden', 'warehouseScope', 'mainWarehouseRequired', 'invalidDestination',
    'cannotCancel', 'cannotClose'];

  function collect(obj: any, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? collect(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
  }

  it.each([['en', en], ['ar', ar]])('%s has every material-request and purchase-order error key', (_lang, dict) => {
    const keys = new Set(collect(dict));
    for (const k of [...mrKeys.map((k) => `pages.materialRequests.errors.${k}`),
                      ...poKeys.map((k) => `pages.purchaseOrders.errors.${k}`),
                      'errors.unexpected', 'errors.notFound', 'errors.forbidden']) {
      expect(keys.has(k)).toBe(true);
    }
  });
});
