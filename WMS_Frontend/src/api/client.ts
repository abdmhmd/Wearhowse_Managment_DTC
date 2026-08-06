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
