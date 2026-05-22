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
  balance_cents: number;
  total_used_cents: number;
  created_at: string;
  last_login_at: string | null;
  /** Group IDs the user can actually use right now (defaults + adds − removes). */
  effective_group_ids: number[];
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
}

function buildQuery(f: AdminUsersFilter): string {
  const p = new URLSearchParams();
  if (f.page) p.set('page', String(f.page));
  if (f.page_size) p.set('page_size', String(f.page_size));
  if (f.search) p.set('search', f.search);
  if (f.status) p.set('status', f.status);
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

/* ---- Per-user group overrides ---- */

export interface UserGroupOverrides {
  /** System-wide default groups for regular users (read-only here). */
  default_group_ids: number[];
  added_group_ids: number[];
  removed_group_ids: number[];
  effective_group_ids: number[];
}

export interface SetUserGroupOverridesPayload {
  added_group_ids: number[];
  removed_group_ids: number[];
}

export function useUserGroupOverrides(userId: number | null) {
  return useQuery<UserGroupOverrides>({
    queryKey: ['admin-user-group-overrides', userId],
    queryFn: () => api.get<UserGroupOverrides>(`/admin/users/${userId}/group-overrides`),
    enabled: userId != null,
  });
}

export function useSetUserGroupOverrides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SetUserGroupOverridesPayload }) =>
      api.put<UserGroupOverrides>(`/admin/users/${id}/group-overrides`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ['admin-user-group-overrides', vars.id] });
    },
  });
}
