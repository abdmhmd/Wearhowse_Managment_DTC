// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import UsersPage from '@/pages/users/UsersPage';
import { mockApi } from '@/test/api-mock';
import { renderWithProviders, resetApiMock, when, apiResponse, setUser } from '@/test/test-utils';

beforeEach(() => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
  setUser({ permissions: ['users:create', 'users:update'] });
});

const departments = [
  { id: 1, code: 'IT', name_ar: 'قسم النظم', name_en: 'IT Department' },
  { id: 2, code: 'HR', name_ar: 'الموارد البشرية', name_en: 'HR Department' },
];

const warehouses = [
  { id: 11, code: 'WH-IT', name_ar: 'مستودع النظم', name_en: 'IT Warehouse', department_id: 1, is_active: true },
  { id: 12, code: 'WH-HR', name_ar: 'مستودع الموارد', name_en: 'HR Warehouse', department_id: 2, is_active: true },
];

const users = [
  {
    id: 1, username: 'ada', full_name: 'Ada Admin', role: 'admin', is_active: true,
    department_id: null, department_name_ar: null, department_name_en: null,
    warehouse_ids: [], created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2, username: 'sami', full_name: 'Sami Manager', role: 'department_manager', is_active: true,
    department_id: 1, department_name_ar: 'قسم النظم', department_name_en: 'IT Department',
    warehouse_ids: [], created_at: '2026-01-01T00:00:00Z',
  },
];

const seed = () => {
  when('get', (url) => url === '/users', () =>
    apiResponse({ items: users, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } })
  );
  when('get', (url) => url === '/departments', () =>
    apiResponse({ items: departments, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } })
  );
  when('get', (url) => url === '/warehouses', () =>
    apiResponse({ items: warehouses, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } })
  );
  when('post', (url) => url === '/users', () =>
    apiResponse({ id: 99, username: 'newuser', full_name: 'New User', role: 'sub_warehouse_manager', department_id: 1, warehouse_ids: [], created_at: '2026-01-01T00:00:00Z' })
  );
  when('put', (url) => url.startsWith('/users/'), () =>
    apiResponse({ id: 2, username: 'sami', full_name: 'Sami Manager', role: 'admin', department_id: null, warehouse_ids: [], created_at: '2026-01-01T00:00:00Z' })
  );
};

const renderPage = async () => {
  seed();
  renderWithProviders(<UsersPage />);
  await screen.findByRole('heading', { name: 'Users' });
  await screen.findByText('sami');
};

const fillBasics = async (username: string) => {
  await userEvent.type(screen.getByLabelText('Username'), username);
  await userEvent.type(screen.getByLabelText('Password'), 'secret123');
  await userEvent.type(screen.getByLabelText('Full Name'), 'New User');
};

const pickDepartment = async (name: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: 'Department' }));
  fireEvent.click(await screen.findByRole('option', { name }));
};

describe('users page: department field', () => {
  it('creates an admin without a department (sends department_id: null)', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Create User' }));

    await fillBasics('newadmin');
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'admin');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      const creates = mockApi.post.mock.calls.filter(([url]) => url === '/users');
      expect(creates.length).toBeGreaterThan(0);
      expect(creates.at(-1)?.[1]).toMatchObject({ username: 'newadmin', role: 'admin', department_id: null });
    });
  });

  it('blocks creating a warehouse manager without a department', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Create User' }));

    await fillBasics('newwm');
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'sub_warehouse_manager');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Department is required for this role')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('creates a warehouse manager with a selected department and sends department_id', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Create User' }));

    await fillBasics('newwm');
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'sub_warehouse_manager');
    await pickDepartment(/IT Department/);
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      const creates = mockApi.post.mock.calls.filter(([url]) => url === '/users');
      expect(creates.length).toBeGreaterThan(0);
      expect(creates.at(-1)?.[1]).toMatchObject({ role: 'sub_warehouse_manager', department_id: 1, warehouse_ids: [] });
    });
  });

  it('pre-fills the department when editing a department_manager', async () => {
    await renderPage();
    const row = screen.getByText('sami').closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button'));

    expect(await screen.findByText('Edit User')).toBeInTheDocument();
    const deptTrigger = screen.getByRole('button', { name: 'Department' });
    expect(deptTrigger).toHaveTextContent('IT Department');
    expect(deptTrigger).not.toBeDisabled();
  });

  it('disables and clears the department when switching an edit to admin', async () => {
    await renderPage();
    const row = screen.getByText('sami').closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button'));
    await screen.findByText('Edit User');

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'admin');
    const deptTrigger = screen.getByRole('button', { name: 'Department' });
    await waitFor(() => expect(deptTrigger).toBeDisabled());
    expect(deptTrigger).toHaveTextContent('Select department');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      const updates = mockApi.put.mock.calls.filter(([url]) => String(url).startsWith('/users/'));
      expect(updates.length).toBeGreaterThan(0);
      expect(updates.at(-1)?.[1]).toMatchObject({ role: 'admin', department_id: null });
    });
  });
});