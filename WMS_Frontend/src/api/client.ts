import axios from 'axios';
import { showError } from '@/utils/toast';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: any) => void; reject: (reason?: any) => void }> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

function getMountedComponents(): string[] {
  const names: string[] = [];
  try {
    const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook || !hook.getFiberRoots) return names;
    const renderers = hook.renderers;
    if (!renderers) return names;
    (renderers as Map<number, unknown>).forEach((_r, id) => {
      let roots: any[] = [];
      try {
        roots = hook.getFiberRoots(id);
      } catch {}
      for (const root of roots) {
        const seen = new Set<any>();
        const walk = (fiber: any) => {
          if (!fiber || seen.has(fiber)) return;
          seen.add(fiber);
          const type = fiber.elementType ?? fiber.type;
          let name: string | null = null;
          if (typeof type === 'string') name = type;
          else if (type) name = type.displayName ?? type.name ?? null;
          if (name && !names.includes(name)) names.push(name);
          walk(fiber.child);
          walk(fiber.sibling);
        };
        if (root.current) walk(root.current);
      }
    });
  } catch {}
  return names;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.url === '/settings') {
    const stack = new Error().stack;
    const origin = (config as any).origin ?? 'unknown';
    const route = window.location.pathname + window.location.search;
    const components = getMountedComponents();
    console.debug(
      `[WMS-TRACE] /settings dispatch @ ${new Date().toISOString()}` +
        `\n  origin: ${origin}` +
        `\n  route: ${route}` +
        `\n  mounted components: ${components.join(', ') || '(none)'}` +
        `\n  stack:\n${stack}`
    );
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.config?.url === '/settings') {
      console.debug(`[WMS-TRACE] /settings resolved @ ${new Date().toISOString()} status=${response.status}`);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.config?.url === '/settings') {
      console.debug(`[WMS-TRACE] /settings failed @ ${new Date().toISOString()} status=${error.response?.status ?? 'no-resp'} ${error.message}`);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('wms_refresh_token');
      if (!refreshToken) {
        localStorage.removeItem('wms_token');
        localStorage.removeItem('wms_user');
        localStorage.removeItem('wms_refresh_token');
        window.location.href = '/login';
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        const newToken = data.data.token;
        const newRefreshToken = data.data.refreshToken;

        localStorage.setItem('wms_token', newToken);
        localStorage.setItem('wms_refresh_token', newRefreshToken);

        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('wms_token');
        localStorage.removeItem('wms_user');
        localStorage.removeItem('wms_refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    const message = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'An unexpected error occurred.';
    showError(message);
    return Promise.reject(error);
  }
);

export default api;
