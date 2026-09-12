import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types';
import { resetApiMock, when } from './api-mock';

export { when, resetApiMock };

// ── Auth store helpers ─────────────────────────────────────────────────────
export function setUser(user: Partial<AuthUser>) {
  useAuthStore.setState({
    user: {
      id: 1,
      username: 'tester',
      full_name: 'Tester',
      role: 'admin',
      department_id: 1,
      permissions: [],
      warehouses: [],
      warehouse_ids: [],
      ...user,
    } as AuthUser,
  });
}

// ── Render helpers ─────────────────────────────────────────────────────────
export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

export function apiResponse(object: any) {
  return { success: true, data: object };
}