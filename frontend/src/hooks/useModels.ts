import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Model {
  id: number;
  name: string;
  provider: string;
  input_price_cents: number;
  output_price_cents: number;
  cache_read_price_cents: number | null;
  enabled: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateModelPayload {
  name: string;
  provider: string;
  input_price_cents: number;
  output_price_cents: number;
  cache_read_price_cents?: number | null;
  description?: string;
  enabled?: boolean;
}

export interface UpdateModelPayload {
  provider?: string;
  input_price_cents?: number;
  output_price_cents?: number;
  cache_read_price_cents?: number | null;
  description?: string;
  enabled?: boolean;
}

const KEY = ['models'] as const;

export function useModels() {
  return useQuery<Model[]>({
    queryKey: KEY,
    queryFn: () => api.get<Model[]>('/admin/models'),
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateModelPayload) => api.post<Model>('/admin/models', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateModelPayload }) =>
      api.patch<Model>(`/admin/models/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ deleted: boolean }>(`/admin/models/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Backend stores cents per 1M tokens. Return $/1M formatted. */
export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
