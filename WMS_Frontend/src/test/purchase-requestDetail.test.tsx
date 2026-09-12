import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import PurchaseRequestDetailPage from '@/pages/purchase-requests/PurchaseRequestDetailPage';
import { renderWithProviders, setUser, resetApiMock, when, apiResponse } from '@/test/test-utils';
import { makeDeptApproved, makeAdminApproved, makeRejected } from '@/test/purchase-request.fixtures';
import type { Permission } from '@/types';

beforeEach(() => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
});

const renderDetail = (permissions: Permission[], route: string, responder: () => any) => {
  setUser({ id: 7, permissions });
  when('get', (url) => url === '/purchase-requests/5', responder);
  return renderWithProviders(
    <Routes>
      <Route path="/purchase-requests/:id" element={<PurchaseRequestDetailPage />} />
    </Routes>,
    { route }
  );
};

describe('purchase request detail page', () => {
  it('renders header, items table and timeline for a pending request', async () => {
    renderDetail(['purchase-requests:view'], '/purchase-requests/5', () => apiResponse(makeDeptApproved()));

    expect(await screen.findByText('PR-2026-000001')).toBeInTheDocument();
    expect(screen.getByText(/Dept Manager/)).toBeInTheDocument();
    expect(screen.getByText(/Hydrochloric Acid/)).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('EA')).toBeInTheDocument();
    expect(screen.getByText('Requested On')).toBeInTheDocument();
    expect(screen.getAllByText('Approved by Department').length).toBeGreaterThan(0);
  });

  it('shows the linked-purchase-order card when a PO was generated', async () => {
    renderDetail(['purchase-requests:view'], '/purchase-requests/5', () => apiResponse(makeAdminApproved()));

    expect(await screen.findByText('Linked Purchase Order')).toBeInTheDocument();
    expect(screen.getByText('PO-2026-000077')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View PO' })).toBeInTheDocument();
    expect(screen.getAllByText('Approved by Admin').length).toBeGreaterThan(0);
  });

  it('shows the rejection alert with the stored reason', async () => {
    renderDetail(['purchase-requests:view'], '/purchase-requests/5', () => apiResponse(makeRejected()));

    expect(await screen.findByText('This request was rejected.')).toBeInTheDocument();
    expect(screen.getByText('Budget not approved this quarter.')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('exposes approve-admin / reject-admin actions to an admin on a dept-approved request', async () => {
    renderDetail(
      ['purchase-requests:view', 'purchase-requests:approve-admin', 'purchase-requests:reject-admin'],
      '/purchase-requests/5',
      () => apiResponse(makeDeptApproved())
    );

    expect(await screen.findByRole('button', { name: 'Approve (Admin)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject (Admin)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve (Department)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('hides Cancel from the creator once the request is dept-approved', async () => {
    renderDetail(
      ['purchase-requests:view_own', 'purchase-requests:cancel'],
      '/purchase-requests/5',
      () => apiResponse(makeDeptApproved())
    );

    // The request is dept_approved so Cancel must NOT appear even for the creator.
    await screen.findByText('PR-2026-000001');
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});