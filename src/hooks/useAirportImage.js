import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { normalizeAirportCode } from './useAirport';

export function useAirportImage(airport) {
  const code = normalizeAirportCode(airport?.icao);
  const name = airport?.name || '';
  return useQuery({
    // Image lookup is slow-changing and cosmetic, so it has a long cache window
    // and waits until we have an airport code from the airport data flow.
    queryKey: ['airport-image', code, name],
    queryFn: () => apiFetch(`/.netlify/functions/airport-image?icao=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`),
    enabled: Boolean(code),
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });
}
