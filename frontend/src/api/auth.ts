import api from './client';

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  display_name?: string | null;
  role: string;
  balance: number;
}

export const authApi = {
  register: (data: { username: string; email: string; password: string; referral_code?: string }) =>
    api.post<AuthResponse>('/auth/register', data),

  login: (data: { username: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', data),

  refresh: (refresh_token: string) =>
    api.post<AuthResponse>('/auth/refresh', { refresh_token }),
};
