import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SiteConfig {
  site_name: string;
  announcement: string;
  logo_url: string;
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
  logo_url?: string;
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
    onSuccess: (data) => {
      qc.setQueryData(SITE_KEY, data);
      // Public site config is rendered by login page / sidebar logo etc.;
      // keep it in sync so the admin sees their changes everywhere without
      // a full page reload.
      qc.setQueryData(['public-site'], data);
    },
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

/* ---- Email (Resend) ---- */

export interface EmailConfigView {
  enabled: boolean;
  provider: string;
  key_masked: string;
  key_configured: boolean;
  from_email: string;
  from_name: string;
}

export interface PatchEmail {
  enabled?: boolean;
  provider?: string;
  /** Plaintext API key; empty string = keep existing. */
  api_key?: string;
  from_email?: string;
  from_name?: string;
}

const EMAIL_KEY = ['admin-settings', 'email'] as const;

export function useEmailConfig() {
  return useQuery<EmailConfigView>({
    queryKey: EMAIL_KEY,
    queryFn: () => api.get<EmailConfigView>('/admin/settings/email'),
  });
}

export function useUpdateEmailConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PatchEmail) =>
      api.patch<EmailConfigView>('/admin/settings/email', patch),
    onSuccess: (data) => qc.setQueryData(EMAIL_KEY, data),
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

/* ---- Default groups for newly registered (and existing) regular users ---- */

export interface DefaultUserGroups {
  group_ids: number[];
}

const DEFAULT_USER_GROUPS_KEY = ['admin-settings', 'default-user-groups'] as const;

export function useDefaultUserGroups() {
  return useQuery<DefaultUserGroups>({
    queryKey: DEFAULT_USER_GROUPS_KEY,
    queryFn: () => api.get<DefaultUserGroups>('/admin/settings/default-user-groups'),
  });
}

export function useUpdateDefaultUserGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (group_ids: number[]) =>
      api.put<DefaultUserGroups>('/admin/settings/default-user-groups', { group_ids }),
    onSuccess: (data) => {
      qc.setQueryData(DEFAULT_USER_GROUPS_KEY, data);
      // Effective groups for every user changed — invalidate admin user list.
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

/* ---- Landing-page pricing showcase groups (one slot per provider) ---- */

export interface LandingPricingGroups {
  openai: number | null;
  anthropic: number | null;
}

const LANDING_PRICING_KEY = ['admin-settings', 'landing-pricing-group'] as const;

export function useLandingPricingGroups() {
  return useQuery<LandingPricingGroups>({
    queryKey: LANDING_PRICING_KEY,
    queryFn: () => api.get<LandingPricingGroups>('/admin/settings/landing-pricing-group'),
  });
}

export function useUpdateLandingPricingGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groups: LandingPricingGroups) =>
      api.put<LandingPricingGroups>('/admin/settings/landing-pricing-group', groups),
    onSuccess: (data) => {
      qc.setQueryData(LANDING_PRICING_KEY, data);
      qc.invalidateQueries({ queryKey: ['public-pricing-showcase'] });
    },
  });
}

export interface PricingShowcaseGroup {
  id: number;
  name: string;
  label: string;
  /** NUMERIC arrives as a string from the backend. */
  multiplier: string;
}

export interface PricingShowcaseModel {
  name: string;
  provider: string;
  input_price_cents: number;
  output_price_cents: number;
  cache_read_price_cents: number | null;
  cache_write_price_cents: number | null;
}

export interface PricingShowcaseSection {
  provider: 'openai' | 'anthropic';
  group: PricingShowcaseGroup;
  models: PricingShowcaseModel[];
}

export interface PricingShowcaseResponse {
  sections: PricingShowcaseSection[];
}

export function usePublicPricingShowcase() {
  return useQuery<PricingShowcaseResponse>({
    queryKey: ['public-pricing-showcase'],
    queryFn: () => api.get<PricingShowcaseResponse>('/pricing-showcase'),
    staleTime: 5 * 60 * 1000,
  });
}
