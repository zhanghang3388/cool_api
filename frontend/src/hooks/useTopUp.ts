import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TopUpInfo {
  presets_cents: number[];
  min_amount_cents: number;
  payment_enabled: boolean;
  payment_name: string;
}

export type TopUpStatus = 'pending' | 'success' | 'failed' | 'refunded';

export interface TopUpRecord {
  id: number;
  amount_cents: number;
  bonus_cents: number;
  method: string;
  status: TopUpStatus;
  out_trade_no: string | null;
  external_txn_id: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderPayload {
  amount_cents: number;
  pay_type: string;
  return_url: string;
  notify_url: string;
}

export interface CreateOrderResponse {
  out_trade_no: string;
  submit_url: string;
}

const INFO_KEY = ['user-topup', 'info'] as const;
const RECORDS_KEY = ['user-topup', 'records'] as const;

export function useTopUpInfo() {
  return useQuery<TopUpInfo>({
    queryKey: INFO_KEY,
    queryFn: () => api.get<TopUpInfo>('/user/topup/info'),
  });
}

export function useTopUpRecords() {
  return useQuery<TopUpRecord[]>({
    queryKey: RECORDS_KEY,
    queryFn: () => api.get<TopUpRecord[]>('/user/topup/records'),
    refetchInterval: 15_000,
  });
}

export function useCreateTopUpOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateOrderPayload) =>
      api.post<CreateOrderResponse>('/user/topup/orders', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: RECORDS_KEY }),
  });
}
