import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type RequestStatus = 'success' | 'error' | 'cached';

export interface UsageLogRow {
  id: number;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  total_cost_cents: number;
  latency_ms: number;
  status: RequestStatus;
  error_message: string | null;
  created_at: string;
}

export interface UsageLogsResponse {
  items: UsageLogRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface UsageSummary {
  today_requests: number;
  today_tokens: number;
  today_cost_cents: number;
  total_requests: number;
  total_tokens: number;
  total_cost_cents: number;
}

export interface UsageLogsFilter {
  page?: number;
  page_size?: number;
  model?: string;
  status?: RequestStatus | '';
  from?: string;
  to?: string;
}

function buildQuery(f: UsageLogsFilter): string {
  const p = new URLSearchParams();
  if (f.page) p.set('page', String(f.page));
  if (f.page_size) p.set('page_size', String(f.page_size));
  if (f.model) p.set('model', f.model);
  if (f.status) p.set('status', f.status);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useUsageLogs(filter: UsageLogsFilter) {
  return useQuery<UsageLogsResponse>({
    queryKey: ['user-usage-logs', filter],
    queryFn: () => api.get<UsageLogsResponse>(`/user/usage/logs${buildQuery(filter)}`),
    placeholderData: (prev) => prev,
  });
}

export function useUsageSummary() {
  return useQuery<UsageSummary>({
    queryKey: ['user-usage-summary'],
    queryFn: () => api.get<UsageSummary>('/user/usage/summary'),
  });
}
