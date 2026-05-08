import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useNotams() {
  const icao = import.meta.env.VITE_AIRPORT_ICAO || 'KVBT';
  return useQuery({
    queryKey: ['notams', icao],
    queryFn: () => apiFetch(`/.netlify/functions/notams?icao=${icao}`),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
}
