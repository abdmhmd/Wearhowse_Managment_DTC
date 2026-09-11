import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../store/auth.store';

describe('Frontend AuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasValidated: false,
    });
  });

  it('initializes with unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it('updates state on login', () => {
    useAuthStore.getState().login('mock-access-token', 'mock-refresh-token', {
      id: 1,
      username: 'admin',
      full_name: 'Administrator',
      role: 'system_admin',
      permissions: ['items:view', 'items:create', 'requests:approve'],
      warehouse_ids: [1, 2],
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('mock-access-token');
    expect(state.user?.username).toBe('admin');
    expect(state.user?.role).toBe('system_admin');
    expect(localStorage.getItem('wms_token')).toBe('mock-access-token');
    expect(localStorage.getItem('wms_refresh_token')).toBe('mock-refresh-token');
  });

  it('clears state and local storage on logout', () => {
    useAuthStore.getState().login('mock-access-token', 'mock-refresh-token', {
      id: 1,
      username: 'admin',
      full_name: 'Administrator',
      role: 'system_admin',
      permissions: ['items:view'],
      warehouse_ids: [1],
    });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(localStorage.getItem('wms_token')).toBeNull();
  });

  it('correctly evaluates permissions with can and canAny', () => {
    useAuthStore.getState().login('mock-access-token', 'mock-refresh-token', {
      id: 2,
      username: 'manager',
      full_name: 'Warehouse Manager',
      role: 'warehouse_manager',
      permissions: ['items:view', 'requests:create'] as any,
      warehouse_ids: [1],
    });

    const { can, canAny, hasRole } = useAuthStore.getState();

    expect(can('items:view' as any)).toBe(true);
    expect(can('items:create' as any)).toBe(false);
    expect(canAny('items:create' as any, 'requests:create' as any)).toBe(true);
    expect(canAny('users:view' as any, 'users:create' as any)).toBe(false);
    expect(hasRole('warehouse_manager')).toBe(true);
    expect(hasRole('system_admin')).toBe(false);
  });
});
