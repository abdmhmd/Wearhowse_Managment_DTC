// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';
import ProjectsPage from '@/pages/projects/ProjectsPage';
import { mockApi } from '@/test/api-mock';
import { renderWithProviders, resetApiMock, when, apiResponse, setUser } from '@/test/test-utils';

beforeEach(() => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
  setUser({
    role: 'department_manager',
    department_id: 13,
    permissions: ['projects:create', 'departments:view', 'warehouses:view'],
  });
});

const departments = [{ id: 13, code: 'ENG', name_ar: 'قسم الهندسة', name_en: 'Engineering' }];
const supervisors = [
  { id: 21, username: 'sara', full_name: 'Sara Super', role: 'supervisor' },
  { id: 22, username: 'nabil', full_name: 'Nabil Sup', role: 'supervisor' },
];

const seed = () => {
  when('get', (url) => url === '/projects', () =>
    apiResponse({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
  );
  when('get', (url) => url === '/departments', () =>
    apiResponse({ items: departments, pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  );
  when('get', (url) => url === '/warehouses', () =>
    apiResponse({ items: [], pagination: { page: 1, limit: 200, total: 0, totalPages: 0 } })
  );
  when('get', (url) => url === '/users/supervisors', () => apiResponse(supervisors));
};

const openCreate = async () => {
  await screen.findByRole('heading', { name: 'Projects' });
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
};

describe('projects form: supervisor picker', () => {
  it('renders supervisor options with full name, username and role sublabel', async () => {
    seed();
    renderWithProviders(<ProjectsPage />);
    await openCreate();

    fireEvent.click(screen.getByRole('button', { name: 'Supervisor' }));
    expect(await screen.findByText('Sara Super — sara')).toBeInTheDocument();
    expect(screen.getByText('Nabil Sup — nabil')).toBeInTheDocument();
    expect(screen.getAllByText('Supervisor').length).toBeGreaterThan(0);
  });

  it('selects a supervisor and updates the trigger', async () => {
    seed();
    renderWithProviders(<ProjectsPage />);
    await openCreate();

    fireEvent.click(screen.getByRole('button', { name: 'Supervisor' }));
    fireEvent.click(await screen.findByRole('option', { name: /Sara Super — sara/ }));

    const trigger = screen.getByRole('button', { name: 'Supervisor' });
    await waitFor(() => expect(trigger).toHaveTextContent('Sara Super — sara'));
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('renders the department picker with department options', async () => {
    seed();
    renderWithProviders(<ProjectsPage />);
    await openCreate();

    fireEvent.click(screen.getByRole('button', { name: 'Department' }));
    expect(await screen.findByRole('option', { name: /Engineering/ })).toBeInTheDocument();
  });
});