import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type UserStatus = 'active' | 'disabled';
export type UserRole = 'admin' | 'user';

export interface AdminUserRow {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  group_id: number;
  group_name: string;
  group_label: string;
  balance_cents: number;
  total_used_cents: number;
  created_at: string;
  last_login_at: string | null;
}

export interface AdminUsersResponse {
  items: AdminUserRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUsersFilter {
  page?: number;
  page_size?: number;
  search?: string;
  status?: UserStatus | '';
  group_id?: number;
}

function buildQuery(f: AdminUsersFilter): string {
  const p = new URLSearchParams();
  if (f.page) p.set('page', String(f.page));
  if (f.page_size) p.set('page_size', String(f.page_size));
  if (f.search) p.set('search', f.search);
  if (f.status) p.set('status', f.status);
  if (f.group_id != null) p.set('group_id', String(f.group_id));
  const s = p.toString();
  return s ? `?${s}` : '';
}

const LIST_KEY = ['admin-users'] as const;

export function useAdminUsers(filter: AdminUsersFilter) {
  return useQuery<AdminUsersResponse>({
    queryKey: [...LIST_KEY, filter],
    queryFn: () => api.get<AdminUsersResponse>(`/admin/users${buildQuery(filter)}`),
    placeholderData: (prev) => prev,
  });
}

export interface UpdateUserPayload {
  status?: UserStatus;
  group_id?: number;
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateUserPayload }) =>
      api.patch(`/admin/users/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export interface TopUpPayload {
  amount_cents: number;
  bonus_cents?: number;
  note?: string;
}

export function useTopUpUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: TopUpPayload }) =>
      api.post(`/admin/users/${id}/topup`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}
