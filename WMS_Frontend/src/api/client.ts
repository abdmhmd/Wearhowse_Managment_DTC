import axios from 'axios';
import { showError } from '@/utils/toast';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('wms_token');
      localStorage.removeItem('wms_user');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    const message = error.response?.data?.message || error.message || 'An unexpected error occurred.';
    showError(message);
    return Promise.reject(error);
  }
);

export default api;
