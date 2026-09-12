import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import WarehousesPage from '@/pages/warehouses/WarehousesPage';
import { mockApi } from '@/test/api-mock';
import { renderWithProviders, resetApiMock, when, apiResponse, setUser } from '@/test/test-utils';

beforeEach(() => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
  setUser({});
});

const departments = [
  { id: 1, code: 'IT', name_ar: 'قسم النظم', name_en: 'IT Department' },
  { id: 2, code: 'HR', name_ar: 'الموارد البشرية', name_en: 'HR Department' },
];

const warehouses = [
  { id: 11, code: 'WH-MAIN', name_ar: 'مستودع رئيسي', name_en: 'Main Warehouse', location: null, is_main: true, department_id: 1, department_name_ar: 'قسم النظم', department_name_en: 'IT Department', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 12, code: 'WH-SUB', name_ar: 'مستودع فرعي', name_en: 'Sub Warehouse', location: 'A', is_main: false, department_id: 1, department_name_ar: 'قسم النظم', department_name_en: 'IT Department', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 13, code: 'WH-CENTRAL', name_ar: 'مركزي', name_en: 'Central', location: null, is_main: false, department_id: null, department_name_ar: null, department_name_en: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

const seed = () => {
  when('get', (url) => url.startsWith('/warehouses'), () =>
    apiResponse({ items: warehouses, pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } })
  );
  when('get', (url) => url === '/departments', () =>
    apiResponse({ items: departments, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } })
  );
  when('post', (url) => url === '/warehouses', () =>
    apiResponse({ id: 99, code: 'WH-NEW', name_ar: 'New', is_main: false, department_id: null })
  );
};

describe('warehouses page', () => {
  it('shows Department column with names, em dash for central, and Type badges', async () => {
    seed();
    renderWithProviders(<WarehousesPage />);
    expect(await screen.findByRole('heading', { name: 'Warehouses' })).toBeInTheDocument();
    await screen.findByText('Central');

    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('Central')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
    expect(within(table).getByText('Main')).toBeInTheDocument();
    expect(within(table).getAllByText('Sub')).toHaveLength(2);
    expect(within(table).getAllByText('IT Department').length).toBeGreaterThan(0);
  });

  it('sends department_id when filtering by department', async () => {
    seed();
    renderWithProviders(<WarehousesPage />);
    await screen.findByRole('heading', { name: 'Warehouses' });
    await screen.findAllByText('IT Department');

    await userEvent.selectOptions(screen.getByLabelText('Filter by Department'), '1');
    await waitFor(() => {
      expect(
        mockApi.get.mock.calls.some(([url, config]: any[]) => url === '/warehouses' && config?.params?.department_id === 1)
      ).toBe(true);
    });
  });

  it('sends is_main when filtering by type', async () => {
    seed();
    renderWithProviders(<WarehousesPage />);
    await screen.findByRole('heading', { name: 'Warehouses' });

    await userEvent.selectOptions(screen.getByLabelText('Filter by Type'), 'main');
    await waitFor(() => {
      expect(
        mockApi.get.mock.calls.some(([url, config]: any[]) => url === '/warehouses' && config?.params?.is_main === true)
      ).toBe(true);
    });

    await userEvent.selectOptions(screen.getByLabelText('Filter by Type'), 'sub');
    await waitFor(() => {
      expect(
        mockApi.get.mock.calls.some(([url, config]: any[]) => url === '/warehouses' && config?.params?.is_main === false)
      ).toBe(true);
    });
  });

  it('shows department dropdown and main toggle in the create form', async () => {
    seed();
    renderWithProviders(<WarehousesPage />);
    await screen.findByRole('heading', { name: 'Warehouses' });

    await userEvent.click(screen.getByRole('button', { name: 'Create Warehouse' }));

    const dept = screen.getByLabelText('Department');
    expect(dept).toBeInTheDocument();
    expect(await screen.findByText('Central (No Department)')).toBeInTheDocument();
    await screen.findAllByText('IT Department');

    const toggle = screen.getByLabelText('Main Warehouse');
    expect(toggle).toBeInTheDocument();
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await userEvent.click(toggle);
    expect((screen.getByLabelText('Main Warehouse') as HTMLInputElement).checked).toBe(true);
  });

  it('blocks a second main warehouse in the same department on the client', async () => {
    seed();
    renderWithProviders(<WarehousesPage />);
    await screen.findByRole('heading', { name: 'Warehouses' });

    await userEvent.click(screen.getByRole('button', { name: 'Create Warehouse' }));
    await screen.findAllByText('IT Department');
    await userEvent.selectOptions(screen.getByLabelText('Department'), '1');
    await userEvent.type(screen.getByLabelText('Code'), 'WH-X');
    await userEvent.type(screen.getByLabelText('Name'), 'Extra');
    await userEvent.click(screen.getByLabelText('Main Warehouse'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('This department already has a main warehouse.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('submits department_id: null and is_main: false for a central warehouse', async () => {
    seed();
    renderWithProviders(<WarehousesPage />);
    await screen.findByRole('heading', { name: 'Warehouses' });

    await userEvent.click(screen.getByRole('button', { name: 'Create Warehouse' }));
    await userEvent.selectOptions(screen.getByLabelText('Department'), '');
    await userEvent.type(screen.getByLabelText('Code'), 'WH-C2');
    await userEvent.type(screen.getByLabelText('Name'), 'Central Two');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const creates = mockApi.post.mock.calls.filter(([url]) => url === '/warehouses');
      expect(creates.length).toBeGreaterThan(0);
      expect(creates.at(-1)?.[1]).toMatchObject({ department_id: null, is_main: false });
    });
  });
});