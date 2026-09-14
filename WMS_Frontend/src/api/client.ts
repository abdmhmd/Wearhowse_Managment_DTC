import axios from 'axios';
import { showError } from '@/utils/toast';
import { getApiErrorMessage } from '@/utils/apiErrors';

/**
 * Central API base URL.
 * - Build-time override: set VITE_API_URL in a local `.env` file (dev/preview).
 * - Production (Netlify): set VITE_API_URL in the Netlify dashboard.
 * - Fallback: the local backend.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

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
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
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

    // NEVER surface raw backend/server messages to the user: the central
    // error mapper translates stable error codes / HTTP statuses into
    // user-friendly i18n messages. The raw error is console-logged in dev.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[API]', error?.response?.status, error?.response?.data ?? error);
    }
    // Callers may opt out of the interceptor toast (e.g. the login form, which
    // renders field-tied error messaging and reset-hint feedback inline).
    if (!originalRequest?.skipApiErrorToast) {
      showError(getApiErrorMessage(error));
    }
    return Promise.reject(error);
  }
);

export default api;
