import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type RequestStatus = 'success' | 'error' | 'cached';

export interface UsageLogRow {
  id: number;
  created_at: string;
  model_name: string;

  group_id: number;
  group_name: string | null;
  group_label: string | null;

  api_key_id: number | null;
  api_key_name: string | null;
  api_key_prefix: string | null;

  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cache_creation_tokens: number;

  input_cost_cents: number;
  output_cost_cents: number;
  total_cost_cents: number;

  /** Model prices at the time of querying (NOT when the request ran). NULL
   * if the model was since deleted. */
  model_input_price_cents: number | null;
  model_output_price_cents: number | null;
  model_cache_read_price_cents: number | null;
  model_cache_write_price_cents: number | null;

  multiplier_applied: number;

  latency_ms: number;
  status: RequestStatus;
  error_message: string | null;
  /** Postgres INET — single hosts serialize as "1.2.3.4/32" or "::1/128". */
  client_ip: string | null;
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
  group_id?: number;
  status?: RequestStatus | '';
  from?: string;
  to?: string;
}

function buildQuery(f: UsageLogsFilter): string {
  const p = new URLSearchParams();
  if (f.page) p.set('page', String(f.page));
  if (f.page_size) p.set('page_size', String(f.page_size));
  if (f.model) p.set('model', f.model);
  if (f.group_id != null) p.set('group_id', String(f.group_id));
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

/* ---- Dashboard: 7-day per-group trend + 1-hour group health ---- */

export interface DailyGroupPoint {
  day: string;
  group_id: number;
  group_name: string;
  group_label: string;
  requests: number;
  tokens: number;
  cost_cents: number;
}

export function useDailyByGroup(days = 7) {
  return useQuery<DailyGroupPoint[]>({
    queryKey: ['user-usage-daily-by-group', days],
    queryFn: () =>
      api.get<DailyGroupPoint[]>(`/user/usage/daily-by-group?days=${days}`),
    staleTime: 60 * 1000,
  });
}

export interface DailyModelPoint {
  day: string;
  model_name: string;
  requests: number;
  tokens: number;
  cost_cents: number;
}

/**
 * Per-model token usage. `groupId === null` means "all groups merged" — the
 * backend collapses identical model names across groups into one series, so
 * the same model used under two different groups won't show up twice.
 */
export function useDailyByModel(days = 7, groupId: number | null = null) {
  return useQuery<DailyModelPoint[]>({
    queryKey: ['user-usage-daily-by-model', days, groupId],
    queryFn: () => {
      const qs = new URLSearchParams({ days: String(days) });
      if (groupId != null) qs.set('group_id', String(groupId));
      return api.get<DailyModelPoint[]>(`/user/usage/daily-by-model?${qs.toString()}`);
    },
    staleTime: 60 * 1000,
  });
}

export type GroupHealthStatus = 'healthy' | 'degraded' | 'down' | 'idle';

export interface HealthBucket {
  idx: number;
  total: number;
  error: number;
}

export interface GroupHealth {
  group_id: number;
  group_name: string;
  group_label: string;
  total: number;
  success: number;
  error: number;
  cached: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  /** ISO timestamp of the most recent error in the window, or null. */
  last_error_at: string | null;
  status: GroupHealthStatus;
  /** Length === bucket_count, oldest first. Slots with no traffic are zero. */
  buckets: HealthBucket[];
  bucket_count: number;
}

export function useGroupHealth(minutes = 60) {
  return useQuery<GroupHealth[]>({
    queryKey: ['user-group-health', minutes],
    queryFn: () => api.get<GroupHealth[]>(`/user/usage/group-health?minutes=${minutes}`),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  });
}
