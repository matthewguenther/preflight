import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useTfr() {
  return useQuery({
    queryKey: ['tfr'],
    queryFn: () => apiFetch('/.netlify/functions/tfr'),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}
