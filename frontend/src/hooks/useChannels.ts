import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ChannelProvider = 'openai' | 'anthropic';
export type ChannelStatus = 'active' | 'warning' | 'error' | 'disabled';

export interface Channel {
  id: number;
  name: string;
  provider: ChannelProvider;
  base_url: string;
  api_key_masked: string;
  priority: number;
  weight: number;
  enabled: boolean;
  status: ChannelStatus;
  allowed_models: string[];
  allowed_group_ids: number[];
  balance_cents: number | null;
  last_test_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateChannelPayload {
  name: string;
  provider: ChannelProvider;
  base_url: string;
  api_key: string;
  priority?: number;
  weight?: number;
  enabled?: boolean;
  allowed_models?: string[];
  allowed_group_ids?: number[];
}

export interface UpdateChannelPayload {
  name?: string;
  base_url?: string;
  /** Provide a new key to rotate; omit to keep the existing one. */
  api_key?: string;
  priority?: number;
  weight?: number;
  enabled?: boolean;
  allowed_models?: string[];
  allowed_group_ids?: number[];
}

export interface ChannelTestResult {
  ok: boolean;
  latency_ms: number;
  detail: string;
  status: ChannelStatus;
}

export interface UpstreamModelEntry {
  id: string;
  owner: string | null;
  created: number | null;
}

export interface PreviewModelsPayload {
  provider: ChannelProvider;
  base_url: string;
  api_key: string;
}

const KEY = ['channels'] as const;

export function useChannels() {
  return useQuery<Channel[]>({
    queryKey: KEY,
    queryFn: () => api.get<Channel[]>('/admin/channels'),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateChannelPayload) => api.post<Channel>('/admin/channels', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateChannelPayload }) =>
      api.patch<Channel>(`/admin/channels/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ deleted: boolean }>(`/admin/channels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTestChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ChannelTestResult>(`/admin/channels/${id}/test`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Probe an upstream with ad-hoc credentials (used in the create-channel form). */
export function usePreviewModels() {
  return useMutation({
    mutationFn: (p: PreviewModelsPayload) =>
      api.post<{ models: UpstreamModelEntry[] }>('/admin/channels/preview-models', p),
  });
}

/** Fetch models for an already-persisted channel (used in the edit modal). */
export function useChannelModels() {
  return useMutation({
    mutationFn: (id: number) =>
      api.get<{ models: UpstreamModelEntry[] }>(`/admin/channels/${id}/models`),
  });
}
