import { create } from 'zustand';
import type { UserRole } from '@/types';
import api from '@/api/client';

interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasValidated: boolean;
  login: (token: string, refreshToken: string, user: AuthUser) => void;
  logout: () => void;
  validateToken: () => Promise<boolean>;
  hasRole: (...roles: UserRole[]) => boolean;
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

  login: (token: string, refreshToken: string, user: AuthUser) => {
    localStorage.setItem('wms_token', token);
    localStorage.setItem('wms_refresh_token', refreshToken);
    localStorage.setItem('wms_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true, hasValidated: false });
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
        await api.get('/settings');
        set({ isAuthenticated: true, hasValidated: true, isLoading: false });
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
}));
