import api from './client';
import type { AxiosRequestConfig } from 'axios';
import type { ApiResponse, LoginPayload, LoginResponse, MeResponse } from '@/types';

export const authApi = {
  login: (data: LoginPayload) =>
    // The login form renders its own inline error messaging (with reset hints)
    // so the global interceptor toast is suppressed for this request only.
    api.post<ApiResponse<LoginResponse>>('/auth/login', data, {
      skipApiErrorToast: true,
    } as AxiosRequestConfig),

  me: () => api.get<ApiResponse<MeResponse>>('/auth/me'),
};