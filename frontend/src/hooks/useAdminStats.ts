import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AdminOverview {
  today_requests: number;
  today_tokens: number;
  today_topup_cents: number;
  active_users_today: number;
}

export interface TrendPoint {
  day: string;
  requests: number;
  tokens: number;
  cost_cents: number;
}

export interface ProviderSlice {
  provider: string;
  requests: number;
}

export interface RecentRequest {
  id: number;
  user_id: number;
  username: string;
  model_name: string;
  tokens: number;
  total_cost_cents: number;
  status: 'success' | 'error' | 'cached';
  created_at: string;
}

export interface AdminDailyModelPoint {
  day: string;
  model_name: string;
  requests: number;
  tokens: number;
  cost_cents: number;
}

export interface ActiveUser {
  user_id: number;
  username: string;
  last_active: string;
  requests: number;
}

export interface TopUser {
  user_id: number;
  username: string;
  requests: number;
  tokens: number;
  cost_cents: number;
}

export interface RecentTopUp {
  id: number;
  user_id: number;
  username: string;
  amount_cents: number;
  bonus_cents: number;
  method: string;
  created_at: string;
}

export function useAdminOverview() {
  return useQuery<AdminOverview>({
    queryKey: ['admin-stats', 'overview'],
    queryFn: () => api.get<AdminOverview>('/admin/stats/overview'),
    refetchInterval: 30_000,
  });
}

export function useRequestsTrend(days = 7) {
  return useQuery<TrendPoint[]>({
    queryKey: ['admin-stats', 'trend', days],
    queryFn: () => api.get<TrendPoint[]>(`/admin/stats/requests-trend?days=${days}`),
  });
}

export function useAdminDailyByModel(days = 7, groupId: number | null = null) {
  return useQuery<AdminDailyModelPoint[]>({
    queryKey: ['admin-stats', 'daily-by-model', days, groupId],
    queryFn: () => {
      const qs = new URLSearchParams({ days: String(days) });
      if (groupId != null) qs.set('group_id', String(groupId));
      return api.get<AdminDailyModelPoint[]>(`/admin/stats/daily-by-model?${qs.toString()}`);
    },
    staleTime: 60 * 1000,
  });
}

export function useProviderDistribution() {
  return useQuery<ProviderSlice[]>({
    queryKey: ['admin-stats', 'providers'],
    queryFn: () => api.get<ProviderSlice[]>('/admin/stats/provider-distribution'),
  });
}

export function useRecentRequests(limit = 10) {
  return useQuery<RecentRequest[]>({
    queryKey: ['admin-stats', 'recent', limit],
    queryFn: () => api.get<RecentRequest[]>(`/admin/stats/recent-requests?limit=${limit}`),
    refetchInterval: 15_000,
  });
}

export function useActiveUsers(limit = 8) {
  return useQuery<ActiveUser[]>({
    queryKey: ['admin-stats', 'active-users', limit],
    queryFn: () => api.get<ActiveUser[]>(`/admin/stats/active-users?limit=${limit}`),
    refetchInterval: 30_000,
  });
}

export function useTopUsers(days = 7, limit = 8) {
  return useQuery<TopUser[]>({
    queryKey: ['admin-stats', 'top-users', days, limit],
    queryFn: () =>
      api.get<TopUser[]>(`/admin/stats/top-users?days=${days}&limit=${limit}`),
    staleTime: 60_000,
  });
}

export function useRecentTopUps(limit = 8) {
  return useQuery<RecentTopUp[]>({
    queryKey: ['admin-stats', 'recent-topups', limit],
    queryFn: () => api.get<RecentTopUp[]>(`/admin/stats/recent-topups?limit=${limit}`),
    refetchInterval: 30_000,
  });
}
