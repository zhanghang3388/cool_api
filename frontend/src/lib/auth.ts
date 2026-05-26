import { api, setToken, getToken, ApiError } from './api';

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'disabled';

export interface UserInfo {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  balance_cents: number;
  created_at: string;
  last_login_at: string | null;
}

interface LoginResponse {
  token: string;
  user: UserInfo;
}

export async function login(username: string, password: string): Promise<UserInfo> {
  const res = await api.post<LoginResponse>('/user/auth/login', { username, password });
  setToken(res.token);
  return res.user;
}

export async function register(
  username: string,
  password: string,
  email: string,
  code: string
): Promise<UserInfo> {
  const res = await api.post<LoginResponse>('/user/auth/register', {
    username,
    password,
    email,
    code,
  });
  setToken(res.token);
  return res.user;
}

export async function requestEmailCode(email: string): Promise<void> {
  await api.post<unknown>('/user/auth/email-code', { email });
}

export function logout() {
  setToken(null);
}

export async function fetchCurrentUser(): Promise<UserInfo | null> {
  if (!getToken()) return null;
  try {
    return await api.get<UserInfo>('/user/auth/me');
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      setToken(null);
      return null;
    }
    throw err;
  }
}

export function landingPath(role: UserRole): string {
  return role === 'admin' ? '/admin' : '/console';
}
