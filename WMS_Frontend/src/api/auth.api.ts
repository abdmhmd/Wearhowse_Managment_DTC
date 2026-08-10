import api from './client';
import type { ApiResponse, LoginPayload, LoginResponse, MeResponse } from '@/types';

export const authApi = {
  login: (data: LoginPayload) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data),

  me: () =>
    api.get<ApiResponse<MeResponse>>('/auth/me'),
};
