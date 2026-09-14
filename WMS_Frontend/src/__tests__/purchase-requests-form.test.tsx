// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';
import CreatePurchaseRequestPage from '@/pages/purchase-requests/CreatePurchaseRequestPage';
import { mockApi } from '@/test/api-mock';
import { renderWithProviders, resetApiMock, when, apiResponse, setUser } from '@/test/test-utils';

beforeEach(() => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
  setUser({ role: 'admin', department_id: 1, permissions: ['purchase-requests:create', 'warehouses:view'] });
});

const warehouses = [
  {
    id: 11, code: 'WH-MAIN', is_main: true, department_id: 1,
    name_ar: 'مستودع رئيسي', name_en: 'Main Warehouse',
    department_name_ar: 'قسم النظم', department_name_en: 'IT Department',
  },
  {
    id: 12, code: 'WH-LAB', is_main: true, department_id: 1,
    name_ar: 'مستودع المختبر', name_en: 'Lab Warehouse',
    department_name_ar: 'قسم النظم', department_name_en: 'IT Department',
  },
  {
    id: 13, code: 'WH-OTHER', is_main: true, department_id: 2,
    name_ar: 'مستودع آخر', name_en: 'Other Warehouse',
    department_name_ar: 'قسم آخر', department_name_en: 'HR Department',
  },
];

const seed = () => {
  when('get', (url) => url === '/warehouses', () =>
    apiResponse({ items: warehouses, pagination: { page: 1, limit: 200, total: 3, totalPages: 1 } })
  );
};

describe('purchase request form: warehouse picker', () => {
  it('renders the warehouse options with code, name and department sublabel', async () => {
    seed();
    renderWithProviders(<CreatePurchaseRequestPage />);
    await screen.findByRole('heading', { name: 'New Purchase Request' });

    fireEvent.click(screen.getByRole('button', { name: 'Warehouse' }));
    expect(await screen.findByText('WH-MAIN — Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('WH-LAB — Lab Warehouse')).toBeInTheDocument();
    // Only the department-owned (dept 1) main warehouses are offered.
    expect(screen.queryByText('WH-OTHER — Other Warehouse')).not.toBeInTheDocument();
    // Sublabels render department names.
    expect(screen.getAllByText('IT Department').length).toBeGreaterThan(0);
  });

  it('selects an option and updates the trigger', async () => {
    seed();
    renderWithProviders(<CreatePurchaseRequestPage />);
    await screen.findByRole('heading', { name: 'New Purchase Request' });

    fireEvent.click(screen.getByRole('button', { name: 'Warehouse' }));
    fireEvent.click(await screen.findByRole('option', { name: /WH-LAB — Lab Warehouse/ }));

    const trigger = screen.getByRole('button', { name: 'Warehouse' });
    await waitFor(() => expect(trigger).toHaveTextContent('WH-LAB — Lab Warehouse'));
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});