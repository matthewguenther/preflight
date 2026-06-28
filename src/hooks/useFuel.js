import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useFuel(selectedIcao) {
  const icao = selectedIcao || '';
  return useQuery({
    // Fuel prices change much more slowly than weather, but we still refresh
    // periodically so the AirNav source-of-truth display stays current.
    queryKey: ['fuel', icao],
    queryFn: () => apiFetch(`/.netlify/functions/fuel?icao=${icao}`),
    enabled: Boolean(icao),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}
