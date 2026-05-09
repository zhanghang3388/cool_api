import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Model } from './useModels';

/** User-facing model catalog. Only returns enabled models. */
export function useUserModels() {
  return useQuery<Model[]>({
    queryKey: ['user-models'],
    queryFn: () => api.get<Model[]>('/user/models'),
  });
}
