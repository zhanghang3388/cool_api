import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SiteConfig {
  site_name: string;
  announcement: string;
}

export interface PaymentConfigView {
  enabled: boolean;
  provider: string;
  pid: string;
  key_masked: string;
  key_configured: boolean;
  api_url: string;
  name: string;
}

export interface PatchSite {
  site_name?: string;
  announcement?: string;
}

export interface PatchPayment {
  enabled?: boolean;
  provider?: string;
  pid?: string;
  /** Plaintext merchant key; empty string = keep existing. */
  key?: string;
  api_url?: string;
  name?: string;
}

const SITE_KEY = ['admin-settings', 'site'] as const;
const PAYMENT_KEY = ['admin-settings', 'payment'] as const;

export function useSiteConfig() {
  return useQuery<SiteConfig>({
    queryKey: SITE_KEY,
    queryFn: () => api.get<SiteConfig>('/admin/settings/site'),
  });
}

export function useUpdateSiteConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PatchSite) =>
      api.patch<SiteConfig>('/admin/settings/site', patch),
    onSuccess: (data) => qc.setQueryData(SITE_KEY, data),
  });
}

export function usePaymentConfig() {
  return useQuery<PaymentConfigView>({
    queryKey: PAYMENT_KEY,
    queryFn: () => api.get<PaymentConfigView>('/admin/settings/payment'),
  });
}

export function useUpdatePaymentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PatchPayment) =>
      api.patch<PaymentConfigView>('/admin/settings/payment', patch),
    onSuccess: (data) => qc.setQueryData(PAYMENT_KEY, data),
  });
}

/** Public (unauthenticated) site metadata — used by login/register pages. */
export function usePublicSiteConfig() {
  return useQuery<SiteConfig>({
    queryKey: ['public-site'],
    queryFn: () => api.get<SiteConfig>('/site'),
    staleTime: 5 * 60 * 1000,
  });
}
