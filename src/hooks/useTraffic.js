import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useTraffic(radiusNm = 35, center = undefined) {
  const lat = center?.lat;
  const lon = center?.lon;
  const icao = center?.icao || 'KVBT';
  return useQuery({
    queryKey: ['traffic', icao, lat, lon, radiusNm],
    queryFn: () => {
      // The function can default to KVBT, but passing lat/lon keeps traffic
      // centered on whichever airport the user selected.
      const params = new URLSearchParams({ radius_nm: String(radiusNm) });
      if (lat != null && lon != null) {
        params.set('lat', String(lat));
        params.set('lon', String(lon));
        params.set('icao', icao);
      }
      return apiFetch(`/.netlify/functions/traffic?${params.toString()}`);
    },
    // A null center means "do not fetch yet"; undefined means "use defaults";
    // a populated center must have numeric coordinates.
    enabled: center === null ? false : lat == null || lon == null || (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))),
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
  });
}
