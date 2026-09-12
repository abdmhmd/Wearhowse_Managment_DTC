import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { loginSchema, type LoginFormData } from '@/schemas/auth.schema';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { BuildingStorefrontIcon } from '@heroicons/react/24/outline';
import { showSuccess } from '@/utils/toast';

interface LoginFailure {
  code: string;
  message: string;
  attemptCount: number;
  showResetHint: boolean;
}

/**
 * Surface-only login failure info. The server keeps the response generic
 * (AUTH_INVALID_CREDENTIALS regardless of whether the username exists), so we
 * only expose the code-specific messages the server explicitly authorizes:
 * account disabled, role disabled, rate limited, or the generic credentials
 * error — plus the progressive-delay attempt metadata that helps legitimate
 * users self-diagnose ("try resetting") without revealing anything about the
 * account's existence.
 */
function extractLoginFailure(error: any, t: TFunction, fallbackCode = 'ERROR'): LoginFailure {
  const data = error?.response?.data ?? {};
  const apiError = data?.error ?? {};
  const details = apiError?.details ?? {};
  const code = String(apiError?.code ?? fallbackCode);

  const MESSAGES: Record<string, string> = {
    AUTH_INVALID_CREDENTIALS: t('auth.login.errors.AUTH_INVALID_CREDENTIALS'),
    AUTH_ACCOUNT_DISABLED: t('auth.login.errors.AUTH_ACCOUNT_DISABLED'),
    AUTH_ROLE_DISABLED: t('auth.login.errors.AUTH_ROLE_DISABLED'),
    AUTH_RATE_LIMITED: t('auth.login.errors.AUTH_RATE_LIMITED'),
    TOO_MANY_REQUESTS: t('auth.login.errors.AUTH_RATE_LIMITED'),
  };

  return {
    code,
    message: MESSAGES[code] ?? t('auth.login.errors.ERROR'),
    attemptCount: Number(details?.attempt_count) || 0,
    showResetHint: Boolean(details?.show_reset_hint),
  };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setFailure(null);
    setIsLoading(true);
    try {
      const response = await authApi.login(data);
      const { token, refreshToken, user } = response.data.data;
      login(token, refreshToken, user);
      showSuccess(t('auth.welcomeBack', { name: user.full_name }));
      navigate('/');
    } catch (error) {
      setFailure(extractLoginFailure(error, t));
    } finally {
      setIsLoading(false);
    }
  };

  const remainingAttempts = failure?.code === 'AUTH_INVALID_CREDENTIALS' ? 3 - failure.attemptCount : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <BuildingStorefrontIcon className="h-16 w-16 text-primary-600" />
          </div>
          <h2 className="mt-4 text-3xl font-bold text-gray-900">{t('app.title')}</h2>
          <p className="mt-2 text-sm text-gray-600">{t('app.subtitle')}</p>
        </div>

        <form className="mt-8 space-y-6 bg-white p-8 rounded-xl shadow" onSubmit={handleSubmit(onSubmit)}>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900">{t('auth.login.title')}</h1>
          </div>

          {failure && (
            <div
              role="alert"
              className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 space-y-1"
            >
              <p>{failure.message}</p>
              {failure.showResetHint && (
                <p className="font-medium">{t('auth.login.attempts.resetHint')}</p>
              )}
              {!failure.showResetHint && remainingAttempts !== null && remainingAttempts > 0 && (
                <p>
                  {t('auth.login.attempts.remaining', {
                    count: String(remainingAttempts),
                  })}
                </p>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                {t('auth.username')}
              </label>
              <input
                {...register('username')}
                id="username"
                type="text"
                autoComplete="username"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder={t('auth.username')}
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{t(errors.username.message ?? '')}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t('auth.password')}
              </label>
              <input
                {...register('password')}
                id="password"
                type="password"
                autoComplete="current-password"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder={t('auth.password')}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{t(errors.password.message ?? '')}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-primary-600 hover:text-primary-500"
            >
              {t('auth.login.forgotPassword')}
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('auth.login.submitting')}
              </span>
            ) : (
              t('auth.login.submit')
            )}
          </button>
        </form>
      </div>
    </div>
  );
}