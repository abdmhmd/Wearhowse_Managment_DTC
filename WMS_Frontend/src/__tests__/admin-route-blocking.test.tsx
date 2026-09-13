import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import App from '@/App';
import { useAuthStore } from '@/store/auth.store';
import { when, apiResponse, resetApiMock } from '@/test/test-utils';
import type { Permission, UserRole } from '@/types';

const EMPTY_PAGE = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };

function authAs(role: UserRole, permissions: Permission[]) {
  const user = {
    id: 1,
    username: 'tester',
    full_name: 'Tester',
    role,
    department_id: 1,
    permissions,
    warehouses: [],
    warehouse_ids: [],
  };
  localStorage.setItem('wms_token', 't');
  localStorage.setItem('wms_user', JSON.stringify(user));
  useAuthStore.setState({
    token: 't',
    user: user as any,
    isAuthenticated: true,
    isLoading: false,
    hasValidated: true,
  });
}

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  render(<App />);
}

describe('admin route blocking', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('wms_lang', 'en');
    resetApiMock();
    window.history.pushState({}, '', '/');
  });

  it('blocks admin from /custodies despite holding custodies:view', async () => {
    authAs('admin', ['custodies:view', 'projects:view']);
    renderAt('/custodies');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Custodies' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Projects' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Material Requests' })).toBeNull();
  });

  it('blocks admin from /projects despite holding projects:view', async () => {
    authAs('admin', ['custodies:view', 'projects:view']);
    renderAt('/projects');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Custodies' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Projects' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Material Requests' })).toBeNull();
  });

  it('blocks admin from /requests (permission was revoked)', async () => {
    authAs('admin', ['custodies:view', 'projects:view']);
    renderAt('/requests');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Material Requests' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Custodies' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Projects' })).toBeNull();
  });

  it('allows a warehouse manager into /custodies', async () => {
    when('get', (url) => url.startsWith('/custodies'), () => apiResponse(EMPTY_PAGE));
    authAs('sub_warehouse_manager', ['custodies:view', 'projects:view']);
    renderAt('/custodies');

    expect(await screen.findByRole('heading', { name: 'Custodies' })).toBeInTheDocument();
  });

  it('allows a warehouse manager into /projects', async () => {
    when('get', (url) => url.startsWith('/projects'), () => apiResponse(EMPTY_PAGE));
    authAs('sub_warehouse_manager', ['custodies:view', 'projects:view']);
    renderAt('/projects');

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
  });

  it('allows a warehouse manager into /requests', async () => {
    when('get', (url) => url.startsWith('/requests'), () => apiResponse(EMPTY_PAGE));
    authAs('sub_warehouse_manager', ['requests:view']);
    renderAt('/requests');

    expect(await screen.findByRole('heading', { name: 'Material Requests' })).toBeInTheDocument();
  });
});