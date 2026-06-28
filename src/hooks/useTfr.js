import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useTfr(selectedIcao) {
  const icao = selectedIcao || '';
  return useQuery({
    queryKey: ['tfr', icao],
    queryFn: () => apiFetch(`/.netlify/functions/tfr?icao=${icao}`),
    enabled: Boolean(icao),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}
