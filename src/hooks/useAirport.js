import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

const AIRPORT_DATA_VERSION = 'freq-v2';

export function normalizeAirportCode(value) {
  const input = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (input.length === 3) return `K${input}`;
  return input || 'KVBT';
}

export function useAirport(icao) {
  const code = normalizeAirportCode(icao);
  return useQuery({
    queryKey: ['airport', code, AIRPORT_DATA_VERSION],
    queryFn: () => apiFetch(`/.netlify/functions/airport?icao=${code}&v=${AIRPORT_DATA_VERSION}`),
    staleTime: 5 * 60 * 1000,
  });
}
