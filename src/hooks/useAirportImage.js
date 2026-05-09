import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { normalizeAirportCode } from './useAirport';

export function useAirportImage(airport) {
  const code = normalizeAirportCode(airport?.icao);
  const name = airport?.name || '';
  return useQuery({
    queryKey: ['airport-image', code, name],
    queryFn: () => apiFetch(`/.netlify/functions/airport-image?icao=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`),
    enabled: Boolean(code),
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });
}
