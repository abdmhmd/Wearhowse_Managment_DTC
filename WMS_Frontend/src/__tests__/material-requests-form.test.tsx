// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';
import CreateMaterialRequestPage from '@/pages/material-requests/CreateMaterialRequestPage';
import { mockApi } from '@/test/api-mock';
import { renderWithProviders, resetApiMock, when, apiResponse, setUser } from '@/test/test-utils';

beforeEach(() => {
  resetApiMock();
  localStorage.setItem('wms_lang', 'en');
  vi.clearAllMocks();
  setUser({
    role: 'admin',
    department_id: 1,
    permissions: ['requests:create', 'warehouses:view', 'items:view', 'departments:view', 'projects:view'],
  });
});

const projects = [
  { id: 31, project_no: 'P2025-01', name: 'Research One', status: 'open', supervisor_name: 'Sara Super' },
  { id: 32, project_no: 'P2025-02', name: 'Graduation Two', status: 'open', supervisor_name: 'Nabil Sup' },
];

const seed = () => {
  when('get', (url) => url === '/warehouses', () =>
    apiResponse({
      items: [{
        id: 41, code: 'SW-1', is_main: false, is_active: true, department_id: 1,
        name_ar: 'مستودع فرعي', name_en: 'Sub Warehouse',
        department_name_ar: 'قسم النظم', department_name_en: 'IT Department',
      }],
      pagination: { page: 1, limit: 200, total: 1, totalPages: 1 },
    })
  );
  when('get', (url) => url === '/departments', () =>
    apiResponse({ items: [{ id: 1, code: 'IT', name_ar: 'قسم النظم', name_en: 'IT Department' }], pagination: { page: 1, limit: 200, total: 1, totalPages: 1 } })
  );
  when('get', (url) => url === '/items', () =>
    apiResponse({
      items: [{ id: 51, item_code: 'ITM-1', unit_code: 'UN', unit_name_ar: 'وحدة', unit_name_en: 'Unit', name_ar: 'أداة', name_en: 'Tool' }],
      pagination: { page: 1, limit: 200, total: 1, totalPages: 1 },
    })
  );
  when('get', (url) => url === '/projects', () =>
    apiResponse({ items: projects, pagination: { page: 1, limit: 200, total: 2, totalPages: 1 } })
  );
};

describe('material request form: project picker', () => {
  it('shows the project picker only for a project request and renders options', async () => {
    seed();
    renderWithProviders(<CreateMaterialRequestPage />);
    await screen.findByRole('heading', { name: 'New Request' });

    expect(screen.queryByRole('button', { name: 'Project' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Request Type'), { target: { value: 'project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));

    expect(await screen.findByText('P2025-01 — Research One')).toBeInTheDocument();
    expect(screen.getByText('P2025-02 — Graduation Two')).toBeInTheDocument();
    expect(screen.getAllByText(/Sara Super|Nabil Sup/).length).toBeGreaterThan(0);
  });

  it('selects a project and updates the trigger', async () => {
    seed();
    renderWithProviders(<CreateMaterialRequestPage />);
    await screen.findByRole('heading', { name: 'New Request' });

    fireEvent.change(screen.getByLabelText('Request Type'), { target: { value: 'project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    fireEvent.click(await screen.findByRole('option', { name: /P2025-02 — Graduation Two/ }));

    const trigger = screen.getByRole('button', { name: 'Project' });
    await waitFor(() => expect(trigger).toHaveTextContent('P2025-02 — Graduation Two'));
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});