import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useWeather(selectedIcao) {
  const icao = selectedIcao || import.meta.env.VITE_AIRPORT_ICAO || 'KVBT';
  return useQuery({
    queryKey: ['weather', icao],
    queryFn: () => apiFetch(`/.netlify/functions/weather?icao=${icao}`),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
