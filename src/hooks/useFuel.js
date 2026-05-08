import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useFuel() {
  return useQuery({
    queryKey: ['fuel'],
    queryFn: () => apiFetch('/.netlify/functions/fuel'),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}
