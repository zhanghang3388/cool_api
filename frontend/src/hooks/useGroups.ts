import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type GroupProvider = 'anthropic' | 'openai';

export interface Group {
  id: number;
  provider: GroupProvider;
  name: string;
  label: string;
  /** multiplier is returned by backend as a string (NUMERIC) */
  multiplier: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateGroupPayload {
  provider: GroupProvider;
  name: string;
  label: string;
  multiplier: number;
  description?: string;
  enabled?: boolean;
}

export interface UpdateGroupPayload {
  label?: string;
  multiplier?: number;
  description?: string;
  enabled?: boolean;
}

const KEY = ['groups'] as const;

export function useGroups() {
  return useQuery<Group[]>({
    queryKey: KEY,
    queryFn: () => api.get<Group[]>('/admin/groups'),
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateGroupPayload) => api.post<Group>('/admin/groups', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateGroupPayload }) =>
      api.patch<Group>(`/admin/groups/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ deleted: boolean }>(`/admin/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Multiplier is returned as a string from the backend; format for display. */
export function formatMultiplier(m: string | number): string {
  const n = typeof m === 'string' ? parseFloat(m) : m;
  if (Number.isNaN(n)) return '—';
  return String(Number(n.toFixed(4))); // drop trailing zeros
}

export function multiplierAsNumber(m: string | number): number {
  const n = typeof m === 'string' ? parseFloat(m) : m;
  return Number.isNaN(n) ? 1 : n;
}

export const PROVIDER_LABELS: Record<GroupProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

export const PROVIDER_ORDER: GroupProvider[] = ['anthropic', 'openai'];
