import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import i18n from '@/i18n';
import en from '@/locales/en/translation.json';
import ar from '@/locales/ar/translation.json';
import PurchaseRequestsListPage from '@/pages/purchase-requests/PurchaseRequestsListPage';
import { renderWithProviders, setUser, resetApiMock, when, apiResponse } from '@/test/test-utils';
import { makeRequest, makeDeptApproved, makeAdminApproved, makeRejected, makeCancelled } from '@/test/purchase-request.fixtures';

beforeEach(async () => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
  setUser({ id: 1, permissions: ['purchase-requests:view'] });
  await i18n.changeLanguage('en');
});

describe('purchase-request status labels', () => {
  it.each([
    ['pending', makeRequest(), 'Pending'],
    ['dept_approved', makeDeptApproved(), 'Approved by Department'],
    ['admin_approved', makeAdminApproved(), 'Approved by Admin'],
    ['rejected', makeRejected(), 'Rejected'],
    ['cancelled', makeCancelled(), 'Cancelled'],
  ])('renders the %s status badge label', async (_status, request, label) => {
    when('get', (url) => url === '/purchase-requests', () =>
      apiResponse({ items: [request], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
    renderWithProviders(<PurchaseRequestsListPage />);
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('has matching statusLabels in en and ar', () => {
    const enStats = (en as any).pages?.purchaseRequests?.statusLabels;
    const arStats = (ar as any).pages?.purchaseRequests?.statusLabels;
    expect(Object.keys(enStats).sort()).toEqual(Object.keys(arStats).sort());
    expect(Object.keys(enStats).sort()).toEqual(['admin_approved', 'cancelled', 'dept_approved', 'pending', 'rejected']);
    for (const k of Object.keys(enStats)) {
      expect(String(enStats[k]).length).toBeGreaterThan(0);
      expect(String(arStats[k]).length).toBeGreaterThan(0);
    }
  });
});