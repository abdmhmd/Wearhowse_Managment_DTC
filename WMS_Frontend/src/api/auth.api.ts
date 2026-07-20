import api from './client';
import type { ApiResponse, LoginPayload, LoginResponse } from '@/types';

export const authApi = {
  login: (data: LoginPayload) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data),
};
