import { describe, it, expect } from 'vitest';
import { mapApiError, isKnownBusinessError } from '../utils/apiErrors';

describe('Frontend API Error Mapper', () => {
  it('maps known INSUFFICIENT_STOCK error code with details', () => {
    const error = {
      response: {
        status: 400,
        data: {
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: 'Raw server error message',
            details: { available: 10, required: 25 },
          },
        },
      },
    };

    const mapped = mapApiError(error);
    expect(mapped.key).toBe('pages.materialRequests.errors.insufficientStockWithQty');
    expect(mapped.params).toEqual({ available: '10', requested: '25' });
    expect(isKnownBusinessError(error)).toBe(true);
  });

  it('maps standard 403 status to forbidden error key', () => {
    const error = {
      response: {
        status: 403,
        data: {
          error: {
            message: 'Access denied',
          },
        },
      },
    };

    const mapped = mapApiError(error);
    expect(mapped.key).toBe('errors.forbidden');
    expect(isKnownBusinessError(error)).toBe(false);
  });

  it('maps standard 404 status to not found error key', () => {
    const error = {
      response: {
        status: 404,
        data: {
          error: {
            message: 'Resource not found',
          },
        },
      },
    };

    const mapped = mapApiError(error);
    expect(mapped.key).toBe('errors.notFound');
  });

  it('maps unhandled status to generic unexpected error key', () => {
    const error = {
      response: {
        status: 500,
        data: {
          error: {
            message: 'Internal server error with stack trace',
          },
        },
      },
    };

    const mapped = mapApiError(error);
    expect(mapped.key).toBe('errors.unexpected');
  });
});
