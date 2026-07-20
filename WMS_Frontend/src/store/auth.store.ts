import { create } from 'zustand';
import type { UserRole } from '@/types';

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
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

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

  login: (token: string, user: AuthUser) => {
    localStorage.setItem('wms_token', token);
    localStorage.setItem('wms_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('wms_token');
    localStorage.removeItem('wms_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  hasRole: (...roles: UserRole[]) => {
    const { user } = get();
    return user ? roles.includes(user.role) : false;
  },
}));
