import api from './client';

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  balance: number;
  quota_limit: number | null;
  rpm_limit: number | null;
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

export interface TodayStats {
  today_requests: number;
  today_cost: number;
  requests_change: number;
  cost_change: number;
  active_tokens: number;
  online_users: number;
}

export interface DailyData {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface ModelRanking {
  model: string;
  count: number;
}

export interface RequestLog {
  id: string;
  user_id: string | null;
  model: string;
  status_code: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  latency_ms: number;
  is_stream: boolean;
  error_message: string | null;
  created_at: string;
}

export interface PricingGroupWithChannels {
  id: string;
  name: string;
  multiplier: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  channel_ids: string[];
}

export interface CacheHitRate {
  model: string;
  total_requests: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cache_hit_rate: number;
}

export interface RateLimitConfig {
  default_user_rpm_limit: number;
  global_rpm_limit: number | null;
}

export const adminApi = {
  // Users
  listUsers: (page = 1, per_page = 20) =>
    api.get<PaginatedUsers>('/admin/users', { params: { page, per_page } }),
  getUser: (id: string) => api.get<User>(`/admin/users/${id}`),
  updateUser: (id: string, data: Partial<Pick<User, 'is_active' | 'role' | 'quota_limit' | 'rpm_limit'>>) =>
    api.patch<User>(`/admin/users/${id}`, data),

  // Provider Keys
  listProviderKeys: () => api.get<ProviderKey[]>('/admin/provider-keys'),
  createProviderKey: (data: Omit<ProviderKey, 'id' | 'is_active' | 'created_at' | 'updated_at'>) =>
    api.post<ProviderKey>('/admin/provider-keys', data),
  updateProviderKey: (id: string, data: Partial<ProviderKey>) =>
    api.patch<ProviderKey>(`/admin/provider-keys/${id}`, data),
  deleteProviderKey: (id: string) => api.delete(`/admin/provider-keys/${id}`),
  fetchModels: (data: { provider: string; api_key: string; base_url?: string }) =>
    api.post<{ models: { id: string }[] }>('/admin/provider-keys/fetch-models', data),

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
  topup: (data: { username: string; amount: number; description?: string }) =>
    api.post<BillingTransaction>('/admin/billing/topup', data),

  // Pricing
  listPricing: () => api.get<any[]>('/admin/pricing'),
  syncPricing: () => api.post<{ added: number; updated: number; total: number }>('/admin/pricing/sync'),
  updatePricing: (id: string, data: any) => api.patch(`/admin/pricing/${id}`, data),
  deletePricing: (id: string) => api.delete(`/admin/pricing/${id}`),
  batchMultiplier: (data: { ids: string[]; multiplier: number }) => api.patch('/admin/pricing/batch-multiplier', data),

  // Settings
  getSettings: () => api.get<[string, unknown][]>('/admin/settings'),
  updateSettings: (data: Record<string, unknown>) => api.patch('/admin/settings', data),
  getModels: () => api.get('/admin/settings/models'),
  getRateLimits: () => api.get<RateLimitConfig>('/admin/settings/rate-limits'),

  // Groups
  listGroups: () => api.get<PricingGroupWithChannels[]>('/admin/groups'),
  createGroup: (data: { name: string; multiplier?: number; channel_ids: string[] }) =>
    api.post<PricingGroupWithChannels>('/admin/groups', data),
  updateGroup: (id: string, data: { name?: string; multiplier?: number; is_active?: boolean; channel_ids?: string[] }) =>
    api.patch<PricingGroupWithChannels>(`/admin/groups/${id}`, data),
  deleteGroup: (id: string) => api.delete(`/admin/groups/${id}`),

  // Stats
  getTodayStats: () => api.get<TodayStats>('/admin/stats/today'),
  getDailyStats: (days: number = 30) =>
    api.get<DailyData[]>('/admin/stats/daily', { params: { days } }),
  getModelRanking: (days: number = 7) =>
    api.get<ModelRanking[]>('/admin/stats/model-ranking', { params: { days } }),
  getRecentLogs: (perPage: number = 10) =>
    api.get<RequestLog[]>('/admin/stats/logs', { params: { page: 1, per_page: perPage } }),
  getCacheHitRate: (groupId?: string) =>
    api.get<CacheHitRate[]>('/admin/stats/cache-hit-rate', { params: groupId ? { group_id: groupId } : {} }),
};
