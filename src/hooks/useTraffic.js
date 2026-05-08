import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useTraffic(radiusNm = 35) {
  return useQuery({
    queryKey: ['traffic', radiusNm],
    queryFn: () => apiFetch(`/.netlify/functions/traffic?radius_nm=${radiusNm}`),
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
  });
}
