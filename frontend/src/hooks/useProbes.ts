import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ChannelProvider } from './useChannels';

export type ProbeStatus = 'operational' | 'degraded' | 'failed' | 'unknown';

export interface ProbeBucket {
  idx: number;
  total: number;
  error: number;
}

export interface ProbeTargetView {
  channel_id: number;
  channel_name: string;
  provider: ChannelProvider;
  group_id: number | null;
  group_label: string | null;
  model: string;
  status: ProbeStatus;
  total: number;
  ok_count: number;
  /** 0..=100, or null when no probes ran in the window. */
  availability: number | null;
  latest_ok: boolean | null;
  latest_latency_ms: number | null;
  avg_latency_ms: number | null;
  last_checked_at: string | null;
  last_detail: string | null;
  buckets: ProbeBucket[];
  bucket_count: number;
}

export interface ProbeMonitorResponse {
  enabled: boolean;
  interval_minutes: number;
  targets: ProbeTargetView[];
}

/** Admin: aggregated probe status for configured targets, auto-refreshing. */
export function useProbeMonitor(minutes = 60) {
  return useQuery<ProbeMonitorResponse>({
    queryKey: ['admin-probe-monitor', minutes],
    queryFn: () =>
      api.get<ProbeMonitorResponse>(`/admin/probes/monitor?minutes=${minutes}`),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  });
}

/** Admin: probe every configured target once, right now. */
export function useRunProbes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ probed: number }>('/admin/probes/run'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-probe-monitor'] }),
  });
}

/* ---- User-facing per-group liveness ---- */

export type GroupLivenessStatus = 'operational' | 'degraded' | 'failed';

export interface GroupLiveness {
  group_id: number;
  status: GroupLivenessStatus;
  availability: number;
  total: number;
  last_checked_at: string | null;
  buckets: ProbeBucket[];
  bucket_count: number;
}

/** User: liveness per accessible group, derived from active probes. */
export function useGroupLiveness(minutes = 60) {
  return useQuery<GroupLiveness[]>({
    queryKey: ['user-group-liveness', minutes],
    queryFn: () => api.get<GroupLiveness[]>(`/user/usage/group-liveness?minutes=${minutes}`),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  });
}
