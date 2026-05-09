import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CacheStats {
  total_entries: number;
  total_hits: number;
  total_stores: number;
  saved_tokens: number;
  saved_cents: number;
  hit_rate: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttl_seconds: number;
  recent_keys_limit: number;
}

export interface CacheEntry {
  hash: string;
  model: string;
  created_at: string;
  ttl_seconds: number;
  tokens: number;
}

const STATS_KEY = ['cache', 'stats'] as const;
const SETTINGS_KEY = ['cache', 'settings'] as const;
const ENTRIES_KEY = ['cache', 'entries'] as const;

export function useCacheStats() {
  return useQuery<CacheStats>({
    queryKey: STATS_KEY,
    queryFn: () => api.get<CacheStats>('/admin/cache/stats'),
    refetchInterval: 15_000,
  });
}

export function useCacheSettings() {
  return useQuery<CacheConfig>({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.get<CacheConfig>('/admin/cache/settings'),
  });
}

export function useUpdateCacheSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CacheConfig>) =>
      api.patch<CacheConfig>('/admin/cache/settings', patch),
    onSuccess: (data) => qc.setQueryData(SETTINGS_KEY, data),
  });
}

export function useCacheEntries(limit = 50) {
  return useQuery<CacheEntry[]>({
    queryKey: [...ENTRIES_KEY, limit],
    queryFn: () => api.get<CacheEntry[]>(`/admin/cache/entries?limit=${limit}`),
    refetchInterval: 30_000,
  });
}

export function useClearCache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ deleted: number }>('/admin/cache/all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STATS_KEY });
      qc.invalidateQueries({ queryKey: ENTRIES_KEY });
    },
  });
}
