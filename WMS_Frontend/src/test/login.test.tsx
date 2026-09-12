import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import LoginPage from '@/pages/auth/LoginPage';
import { authApi } from '@/api/auth.api';
import { mockApi } from '@/test/api-mock';
import { renderWithProviders, resetApiMock, when, apiResponse } from '@/test/test-utils';
import { useAuthStore } from '@/store/auth.store';

const validUser = {
  id: 1,
  username: 'adminuser',
  full_name: 'Admin User',
  role: 'admin',
  department_id: null,
  permissions: [],
  warehouse_ids: [],
};

const loginApiError = (code: string, details?: Record<string, unknown>) => ({
  response: { status: 401, data: { error: { code, details } } },
});

async function renderAndSubmit(username: string, password: string) {
  const user = userEvent.setup();
  renderWithProviders(<LoginPage />);
  await screen.findByRole('heading', { name: 'Sign in to your account' });
  await user.type(screen.getByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

describe('Login page — validation, error UX, and attempt hints', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('wms_lang', 'en');
    resetApiMock();
    vi.clearAllMocks();
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false, hasValidated: true });
  });

  it('blocks an empty username with the format message and never calls the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await screen.findByRole('heading', { name: 'Sign in to your account' });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Username must be at least 3 characters long.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('blocks a 2-character username', async () => {
    await renderAndSubmit('ab', 'secret123');

    expect(await screen.findByText('Username must be at least 3 characters long.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('blocks a username with invalid characters', async () => {
    await renderAndSubmit('has@ymbols', 'secret123');

    expect(
      await screen.findByText(
        'Username may contain only letters, numbers, dots, underscores and dashes.'
      )
    ).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('blocks a too-short password', async () => {
    await renderAndSubmit('validuser', '123');

    expect(await screen.findByText('Password must be at least 6 characters long.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('submits valid credentials and stores the session', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValueOnce({
      data: apiResponse({ token: 'jwt-token', refreshToken: 'refresh-token', user: validUser }),
    } as any);

    await renderAndSubmit('adminuser', 'secret123');

    await waitFor(() => expect(localStorage.getItem('wms_token')).toBe('jwt-token'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.username).toBe('adminuser');
  });

  it('passes the skipApiErrorToast flag on the real auth API request', async () => {
    when('post', (url) => url === '/auth/login', () =>
      apiResponse({ token: 'tok', refreshToken: 'rt', user: validUser })
    );

    await renderAndSubmit('adminuser', 'secret123');

    await waitFor(() => expect(localStorage.getItem('wms_token')).toBe('tok'));
    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/login',
      { username: 'adminuser', password: 'secret123' },
      expect.objectContaining({ skipApiErrorToast: true })
    );
  });

  it('shows the generic error for a bad username or password', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(
      loginApiError('AUTH_INVALID_CREDENTIALS', { attempt_count: 1, show_reset_hint: false })
    );

    await renderAndSubmit('adminuser', 'wrongpass');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Username or password is incorrect.');
    expect(alert.textContent).not.toContain('reset');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows the remaining-attempts hint when two failures have occurred', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(
      loginApiError('AUTH_INVALID_CREDENTIALS', { attempt_count: 2, show_reset_hint: false })
    );

    await renderAndSubmit('adminuser', 'wrongpass');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('1 attempt(s) remaining before additional delay.');
  });

  it('offers the reset hint after three failures', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(
      loginApiError('AUTH_INVALID_CREDENTIALS', { attempt_count: 3, show_reset_hint: true })
    );

    await renderAndSubmit('adminuser', 'wrongpass');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Having trouble? Try resetting your password.');
  });

  it('shows the disabled-account message without attempt hints', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(loginApiError('AUTH_ACCOUNT_DISABLED'));

    await renderAndSubmit('adminuser', 'secret123');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Your account is disabled. Contact your administrator.');
    expect(alert.textContent).not.toContain('remaining');
    expect(alert.textContent).not.toContain('reset');
  });

  it('links to the forgot-password page', async () => {
    renderWithProviders(<LoginPage />);
    await screen.findByRole('heading', { name: 'Sign in to your account' });

    const link = screen.getByRole('link', { name: 'Forgot your password?' });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  it('disables the button and shows the submitting label while the request is pending', async () => {
    vi.spyOn(authApi, 'login').mockImplementationOnce(() => new Promise(() => {}));

    await renderAndSubmit('adminuser', 'secret123');

    const button = screen.getByRole('button', { name: 'Signing in...' });
    expect(button).toBeDisabled();
  });
});