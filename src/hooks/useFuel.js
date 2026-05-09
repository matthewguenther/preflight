import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useFuel(selectedIcao) {
  const icao = selectedIcao || import.meta.env.VITE_AIRPORT_ICAO || 'KVBT';
  return useQuery({
    queryKey: ['fuel', icao],
    queryFn: () => apiFetch(`/.netlify/functions/fuel?icao=${icao}`),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}
