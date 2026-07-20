import i18n from '@/i18n';

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

export function getErrorMessage(error: unknown, fallback: string): string {
  const err = error as ApiError;
  const code = err?.response?.data?.error?.code;
  const details = err?.response?.data?.error?.details;
  const serverMessage = err?.response?.data?.error?.message;

  if (code) {
    const translated = i18n.t(`errors.${code}`, { ...details, defaultValue: '' });
    if (translated && translated !== `errors.${code}`) {
      return translated;
    }
  }

  if (serverMessage) {
    return serverMessage;
  }

  return fallback;
}
