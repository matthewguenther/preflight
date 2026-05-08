import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useRadar() {
  return useQuery({
    queryKey: ['radar'],
    queryFn: () => apiFetch('/.netlify/functions/radar'),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
