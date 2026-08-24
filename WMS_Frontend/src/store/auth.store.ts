import { create } from 'zustand';
import type { UserRole, AuthUser, Permission } from '@/types';
import api from '@/api/client';
import { authApi } from '@/api/auth.api';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasValidated: boolean;
  login: (token: string, refreshToken: string, user: Partial<AuthUser>) => void;
  logout: () => void;
  validateToken: () => Promise<boolean>;
  hasRole: (...roles: UserRole[]) => boolean;
  can: (...permissions: Permission[]) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
}

let validationPromise: Promise<boolean> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('wms_token'),
  user: (() => {
    try {
      const stored = localStorage.getItem('wms_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })(),
  isAuthenticated: !!localStorage.getItem('wms_token'),
  isLoading: false,
  hasValidated: false,

  login: (token: string, refreshToken: string, user: Partial<AuthUser>) => {
    localStorage.setItem('wms_token', token);
    localStorage.setItem('wms_refresh_token', refreshToken);
    localStorage.setItem('wms_user', JSON.stringify(user));
    set({
      token,
      user: {
        id: user.id!,
        username: user.username!,
        full_name: user.full_name!,
        role: user.role!,
        department_id: user.department_id ?? null,
        department_name_ar: user.department_name_ar ?? null,
        department_name_en: user.department_name_en ?? null,
        permissions: user.permissions ?? [],
        warehouses: user.warehouses ?? [],
        warehouse_ids: user.warehouse_ids ?? [],
      },
      isAuthenticated: true,
      hasValidated: false,
    });
  },

  logout: () => {
    const refreshToken = localStorage.getItem('wms_refresh_token');
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    localStorage.removeItem('wms_token');
    localStorage.removeItem('wms_user');
    localStorage.removeItem('wms_refresh_token');
    set({ token: null, user: null, isAuthenticated: false, hasValidated: false });
  },

  validateToken: async () => {
    if (get().hasValidated) return true;

    const token = localStorage.getItem('wms_token');
    if (!token) {
      set({ isAuthenticated: false, user: null, token: null, hasValidated: true });
      return false;
    }

    if (validationPromise) return validationPromise;

    validationPromise = (async () => {
      set({ isLoading: true });
      try {
        // Full context (permissions + assigned warehouses) is loaded fresh from
        // the server so the UI can gate on real authorities, not cached role claims.
        const res = await authApi.me();
        const user = res.data.data.user;
        localStorage.setItem('wms_user', JSON.stringify(user));
        set({ user, isAuthenticated: true, hasValidated: true, isLoading: false });
        return true;
      } catch {
        set({ isAuthenticated: false, user: null, token: null, hasValidated: true, isLoading: false });
        return false;
      } finally {
        validationPromise = null;
      }
    })();

    return validationPromise;
  },

  hasRole: (...roles: UserRole[]) => {
    const { user } = get();
    return user ? roles.includes(user.role) : false;
  },

  can: (...permissions: Permission[]) => {
    const perms = get().user?.permissions ?? [];
    return permissions.every((p) => perms.includes(p));
  },

  canAny: (...permissions: Permission[]) => {
    const perms = get().user?.permissions ?? [];
    return permissions.some((p) => perms.includes(p));
  },
}));
