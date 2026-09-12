import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatePurchaseRequestPage from '@/pages/purchase-requests/CreatePurchaseRequestPage';
import { renderWithProviders, setUser, resetApiMock, when, apiResponse } from '@/test/test-utils';

beforeEach(() => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
  setUser({ id: 2, department_id: 1, permissions: ['purchase-requests:create'] });
});

const seedLookups = () => {
  when('get', (url) => url === '/warehouses', () =>
    apiResponse({
      items: [
        { id: 11, code: 'DWH-1', name_ar: 'المخزن الرئيسي 1', name_en: 'Main Warehouse 1', is_main: true, department_id: 1 },
        { id: 12, code: 'RAW-2', name_ar: 'المخزن الرئيسي 2', name_en: 'Main Warehouse 2', is_main: true, department_id: 9 },
        { id: 21, code: 'SUB-1', name_ar: 'مخزن فرعي', name_en: 'AUX Warehouse', is_main: false, department_id: 1 },
      ],
    })
  );
  when('get', (url) => url === '/items', () =>
    apiResponse({
      items: [
        { id: 10, item_code: 'IT-100', name_ar: 'حمض', name_en: 'Acid', unit_code: 'EA' },
        { id: 11, item_code: 'IT-200', name_ar: 'قفازات', name_en: 'Gloves', unit_code: 'BOX' },
      ],
    })
  );
};

describe('create purchase request form', () => {
  it('disables submit until the form is valid (no items → disabled)', async () => {
    seedLookups();
    renderWithProviders(<CreatePurchaseRequestPage />);
    await screen.findByRole('heading', { name: 'New Purchase Request' });

    const submit = screen.getByRole('button', { name: 'New Purchase Request' });
    expect(submit).toBeDisabled();

    // Only department-1 main warehouses are offered.
    await screen.findByRole('option', { name: 'Main Warehouse 1' });
    const warehouse = screen.getByLabelText('Warehouse');
    await userEvent.selectOptions(warehouse, '11');

    await screen.findByRole('option', { name: /IT-100/ });
    const item = screen.getByLabelText('Item');
    await userEvent.selectOptions(item, '10');
    const quantity = screen.getByLabelText('Quantity');
    await userEvent.type(quantity, '50');

    expect(submit).toBeEnabled();
  });

  it('keeps submit disabled while any added line is invalid', async () => {
    const user = userEvent.setup();
    seedLookups();
    renderWithProviders(<CreatePurchaseRequestPage />);
    await screen.findByRole('heading', { name: 'New Purchase Request' });

    await screen.findByRole('option', { name: 'Main Warehouse 1' });
    await user.selectOptions(screen.getByLabelText('Warehouse'), '11');
    await screen.findByRole('option', { name: /IT-100/ });
    await user.selectOptions(screen.getAllByLabelText('Item')[0], '10');
    await user.type(screen.getAllByLabelText('Quantity')[0], '50');

    const submit = screen.getByRole('button', { name: 'New Purchase Request' });
    expect(submit).toBeEnabled();

    // Add a second line and leave it empty → still invalid.
    await user.click(screen.getByText('Add Item'));
    expect(submit).toBeDisabled();

    // Fill the second line → valid again.
    await user.selectOptions(screen.getAllByLabelText('Item')[1], '11');
    await user.type(screen.getAllByLabelText('Quantity')[1], '25');
    expect(submit).toBeEnabled();
  });

  it('can remove an added line and never removes the last remaining one', async () => {
    const user = userEvent.setup();
    seedLookups();
    renderWithProviders(<CreatePurchaseRequestPage />);
    await screen.findByRole('heading', { name: 'New Purchase Request' });

    // Single line: the remove button is disabled.
    expect(screen.getByTitle('Remove')).toBeDisabled();

    await user.click(screen.getByText('Add Item'));
    expect(screen.getAllByTitle('Remove')).toHaveLength(2);
    expect(screen.getAllByTitle('Remove')[0]).not.toBeDisabled();

    await user.click(screen.getAllByTitle('Remove')[1]);
    expect(screen.getAllByTitle('Remove')).toHaveLength(1);
    expect(screen.getByTitle('Remove')).toBeDisabled();
  });

  it('submits the expected payload and navigates back to the list', async () => {
    const user = userEvent.setup();
    seedLookups();
    let posted: any = undefined;
    when('post', (url: string) => url === '/purchase-requests', (_url: string, body: any) => {
      posted = body;
      return apiResponse({ id: 1, request_no: 'PR-2026-000009' });
    });

    renderWithProviders(<CreatePurchaseRequestPage />);
    await screen.findByRole('heading', { name: 'New Purchase Request' });

    await screen.findByRole('option', { name: 'Main Warehouse 1' });
    await user.selectOptions(screen.getByLabelText('Warehouse'), '11');
    await screen.findByRole('option', { name: /IT-100/ });
    await user.selectOptions(screen.getAllByLabelText('Item')[0], '10');
    await user.type(screen.getAllByLabelText('Quantity')[0], '50');
    await user.click(screen.getByText('Add Item'));
    await user.selectOptions(screen.getAllByLabelText('Item')[1], '11');
    await user.type(screen.getAllByLabelText('Quantity')[1], '25');

    await user.click(screen.getByRole('button', { name: 'New Purchase Request' }));

    await waitFor(() => expect(posted).toEqual({
      warehouse_id: 11,
      notes: null,
      items: [
        { item_id: 10, quantity: 50, unit_code: 'EA', notes: null },
        { item_id: 11, quantity: 25, unit_code: 'BOX', notes: null },
      ],
    }), { timeout: 3000 });
  });
});