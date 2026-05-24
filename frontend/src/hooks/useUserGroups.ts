import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { GroupProvider } from './useGroups';

/** Minimal DTO returned by `/user/groups` — used for token creation. */
export interface UserGroup {
  id: number;
  provider: GroupProvider;
  name: string;
  label: string;
  /** multiplier is returned by backend as a string (NUMERIC) */
  multiplier: string;
}

const KEY = ['user-groups'] as const;

export function useUserGroups() {
  return useQuery<UserGroup[]>({
    queryKey: KEY,
    queryFn: () => api.get<UserGroup[]>('/user/groups'),
  });
}
