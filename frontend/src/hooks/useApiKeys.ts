import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { GroupProvider } from './useGroups';

export interface ApiKeyGroupBinding {
  provider: GroupProvider;
  group_id: number;
  group_name: string;
  group_label: string;
}

export interface ApiKeyRow {
  id: number;
  name: string;
  prefix: string;
  /** Full plaintext token, or null for legacy rows without a stored plaintext. */
  plaintext: string | null;
  enabled: boolean;
  groups: ApiKeyGroupBinding[];
  last_used_at: string | null;
  created_at: string;
}

export type CreatedKey = ApiKeyRow;

/** Per-provider bindings: map provider → group_id. At least one entry required. */
export type ApiKeyGroupsPayload = Partial<Record<GroupProvider, number>>;

export interface CreateKeyPayload {
  name: string;
  groups: ApiKeyGroupsPayload;
}

export interface UpdateKeyPayload {
  name?: string;
  enabled?: boolean;
  /** Provide to fully replace the per-provider bindings. */
  groups?: ApiKeyGroupsPayload;
}

const KEY = ['user-api-keys'] as const;

export function useApiKeys() {
  return useQuery<ApiKeyRow[]>({
    queryKey: KEY,
    queryFn: () => api.get<ApiKeyRow[]>('/user/keys'),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateKeyPayload) =>
      api.post<CreatedKey>('/user/keys', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateKeyPayload }) =>
      api.patch<ApiKeyRow>(`/user/keys/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ deleted: boolean }>(`/user/keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
