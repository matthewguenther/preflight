import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

const AIRPORT_DATA_VERSION = 'freq-v2';

export function normalizeAirportCode(value) {
  // Three-letter FAA identifiers in the US generally need the K prefix for the
  // external APIs. Alphanumeric IDs such as 7M5 should not be rewritten.
  const input = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{3}$/.test(input)) return `K${input}`;
  return input || 'KVBT';
}

export function useAirport(icao) {
  const code = normalizeAirportCode(icao);
  return useQuery({
    // Include the data version so parser/schema changes can invalidate old
    // cached airport payloads without changing the URL contract.
    queryKey: ['airport', code, AIRPORT_DATA_VERSION],
    queryFn: () => apiFetch(`/.netlify/functions/airport?icao=${code}&v=${AIRPORT_DATA_VERSION}`),
    staleTime: 5 * 60 * 1000,
  });
}
