import api from './client';

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  balance: number;
  quota_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  per_page: number;
}

export interface ProviderKey {
  id: string;
  provider: string;
  name: string;
  api_key: string;
  base_url: string | null;
  is_active: boolean;
  weight: number;
  priority: number;
  rpm_limit: number | null;
  tpm_limit: number | null;
  models: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  name: string;
  model_pattern: string;
  strategy: string;
  is_active: boolean;
  created_at: string;
  key_ids: string[];
}

export interface BillingTransaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

export const adminApi = {
  // Users
  listUsers: (page = 1, per_page = 20) =>
    api.get<PaginatedUsers>('/admin/users', { params: { page, per_page } }),
  getUser: (id: string) => api.get<User>(`/admin/users/${id}`),
  updateUser: (id: string, data: Partial<Pick<User, 'is_active' | 'role' | 'quota_limit'>>) =>
    api.patch<User>(`/admin/users/${id}`, data),

  // Provider Keys
  listProviderKeys: () => api.get<ProviderKey[]>('/admin/provider-keys'),
  createProviderKey: (data: Omit<ProviderKey, 'id' | 'is_active' | 'created_at' | 'updated_at'>) =>
    api.post<ProviderKey>('/admin/provider-keys', data),
  updateProviderKey: (id: string, data: Partial<ProviderKey>) =>
    api.patch<ProviderKey>(`/admin/provider-keys/${id}`, data),
  deleteProviderKey: (id: string) => api.delete(`/admin/provider-keys/${id}`),

  // Channels
  listChannels: () => api.get<Channel[]>('/admin/channels'),
  createChannel: (data: { name: string; model_pattern: string; strategy?: string; key_ids: string[] }) =>
    api.post<Channel>('/admin/channels', data),
  updateChannel: (id: string, data: Partial<Channel>) =>
    api.patch<Channel>(`/admin/channels/${id}`, data),
  deleteChannel: (id: string) => api.delete(`/admin/channels/${id}`),

  // Billing
  listTransactions: (page = 1, per_page = 20) =>
    api.get<BillingTransaction[]>('/admin/billing/transactions', { params: { page, per_page } }),
  topup: (data: { user_id: string; amount: number; description?: string }) =>
    api.post<BillingTransaction>('/admin/billing/topup', data),

  // Settings
  getSettings: () => api.get<[string, unknown][]>('/admin/settings'),
  updateSettings: (data: Record<string, unknown>) => api.patch('/admin/settings', data),
  getModels: () => api.get('/admin/settings/models'),
};
