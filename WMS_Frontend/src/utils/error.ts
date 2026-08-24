import i18n from '@/i18n';
import { mapApiError } from '@/utils/apiErrors';

export interface ApiError {
  response?: {
    status?: number;
    data?: {
      success?: boolean;
      error?: {
        message?: string;
        code?: string;
        details?: Record<string, any>;
      };
    };
  };
  message?: string;
}

/**
 * Central user-facing error translation.
 *
 * Delegates to the central API error mapper (utils/apiErrors.ts) which maps
 * stable backend error codes / HTTP statuses to i18n messages. Raw backend
 * messages are NEVER returned or displayed — unknown errors fall back to the
 * provided fallback key/text or a safe generic message.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  const mapped = mapApiError(error);
  const translated = i18n.t(mapped.key, { ...(mapped.params ?? {}), defaultValue: '' }) as string;
  return translated || fallback;
}
