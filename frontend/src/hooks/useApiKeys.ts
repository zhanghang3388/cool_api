import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ApiKeyRow {
  id: number;
  name: string;
  prefix: string;
  enabled: boolean;
  group_id: number;
  group_name: string;
  group_label: string;
  last_used_at: string | null;
  created_at: string;
}

export interface CreatedKey extends ApiKeyRow {
  /** Only present on the creation response. */
  plaintext: string;
}

export interface CreateKeyPayload {
  name: string;
  group_id: number;
}

export interface UpdateKeyPayload {
  name?: string;
  enabled?: boolean;
  group_id?: number;
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
