import { useQuery } from '@tanstack/react-query';
import { fetchCurrentUser, type UserInfo } from '@/lib/auth';

export const CURRENT_USER_KEY = ['current-user'] as const;

export function useCurrentUser() {
  return useQuery<UserInfo | null>({
    queryKey: CURRENT_USER_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
