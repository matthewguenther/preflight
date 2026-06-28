import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useWeather(selectedIcao) {
  const icao = selectedIcao || '';
  return useQuery({
    queryKey: ['weather', icao],
    queryFn: () => apiFetch(`/.netlify/functions/weather?icao=${icao}`),
    enabled: Boolean(icao),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
