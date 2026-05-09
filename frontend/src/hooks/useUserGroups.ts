import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Minimal DTO returned by `/user/groups` — used for token creation. */
export interface UserGroup {
  id: number;
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
