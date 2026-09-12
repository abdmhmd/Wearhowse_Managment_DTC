import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import Sidebar from '@/components/layout/Sidebar';
import PurchaseRequestsListPage from '@/pages/purchase-requests/PurchaseRequestsListPage';
import { renderWithProviders, setUser, resetApiMock, when, apiResponse } from '@/test/test-utils';
import { makeRequest, makeDeptApproved } from '@/test/purchase-request.fixtures';
import type { Permission } from '@/types';

beforeEach(() => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
});

const renderSidebar = () =>
  renderWithProviders(<Sidebar isOpen onClose={() => {}} />);

describe('sidebar purchase-requests entry gating', () => {
  it('shows the entry with purchase-requests:view', () => {
    setUser({ id: 1, permissions: ['purchase-requests:view'] as Permission[] });
    renderSidebar();
    expect(screen.getByText('Purchase Requests')).toBeInTheDocument();
  });

  it('shows the entry with purchase-requests:view_own', () => {
    setUser({ id: 1, permissions: ['purchase-requests:view_own'] as Permission[] });
    renderSidebar();
    expect(screen.getByText('Purchase Requests')).toBeInTheDocument();
  });

  it('hides the entry without either view permission', () => {
    setUser({ id: 1, permissions: ['items:view'] as Permission[] });
    renderSidebar();
    expect(screen.queryByText('Purchase Requests')).not.toBeInTheDocument();
  });
});

describe('list page action buttons are permission + ownership + status gated', () => {
  it('shows Cancel only to the creator of a pending request', async () => {
    setUser({ id: 7, permissions: ['purchase-requests:view', 'purchase-requests:cancel'] as Permission[] });
    when('get', (url) => url === '/purchase-requests', () =>
      apiResponse({ items: [makeRequest()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
    renderWithProviders(<PurchaseRequestsListPage />);
    expect(await screen.findByText('Cancel')).toBeInTheDocument();
    expect(screen.queryByText('Approve (Department)')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject (Department)')).not.toBeInTheDocument();
  });

  it('hides Cancel from a non-creator even with the permission', async () => {
    setUser({ id: 99, permissions: ['purchase-requests:view', 'purchase-requests:cancel'] as Permission[] });
    when('get', (url) => url === '/purchase-requests', () =>
      apiResponse({ items: [makeRequest()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
    renderWithProviders(<PurchaseRequestsListPage />);
    await screen.findByText('PR-2026-000001');
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('shows department approve/reject on pending request', async () => {
    setUser({
      id: 3,
      permissions: ['purchase-requests:view_own', 'purchase-requests:approve-dept', 'purchase-requests:reject-dept'] as Permission[],
    });
    when('get', (url) => url === '/purchase-requests', () =>
      apiResponse({ items: [makeRequest()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
    renderWithProviders(<PurchaseRequestsListPage />);
    expect(await screen.findByText('Approve (Department)')).toBeInTheDocument();
    expect(screen.getByText('Reject (Department)')).toBeInTheDocument();
    expect(screen.queryByText('Approve (Admin)')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject (Admin)')).not.toBeInTheDocument();
  });

  it('shows admin approve/reject only on dept_approved request', async () => {
    setUser({
      id: 1,
      permissions: ['purchase-requests:view', 'purchase-requests:approve-admin', 'purchase-requests:reject-admin'] as Permission[],
    });
    when('get', (url) => url === '/purchase-requests', () =>
      apiResponse({ items: [makeDeptApproved()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
    renderWithProviders(<PurchaseRequestsListPage />);
    expect(await screen.findByText('Approve (Admin)')).toBeInTheDocument();
    expect(screen.getByText('Reject (Admin)')).toBeInTheDocument();
    expect(screen.queryByText('Approve (Department)')).not.toBeInTheDocument();
  });

  it('hides all action buttons without permissions', async () => {
    setUser({ id: 1, permissions: ['purchase-requests:view'] as Permission[] });
    when('get', (url) => url === '/purchase-requests', () =>
      apiResponse({ items: [makeDeptApproved()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
    renderWithProviders(<PurchaseRequestsListPage />);
    await screen.findByText('PR-2026-000001');
    expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Department/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Admin/ })).not.toBeInTheDocument();
  });
});