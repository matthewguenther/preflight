import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useNotams(selectedIcao) {
  const icao = selectedIcao || '';
  return useQuery({
    queryKey: ['notams', icao],
    queryFn: () => apiFetch(`/.netlify/functions/notams?icao=${icao}`),
    enabled: Boolean(icao),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
}
