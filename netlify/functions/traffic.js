import { requireAuth, json } from './_auth.js';

const DEFAULT_CENTER = { icao: 'KVBT', lat: 36.3444, lon: -94.2211 };
const DEFAULT_RADIUS_NM = 35;
const ADSB_FI_URL = 'https://opendata.adsb.fi/api/v3';

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeAircraft(ac) {
  return {
    hex: ac.hex,
    callsign: clean(ac.flight) || clean(ac.r) || ac.hex,
    registration: clean(ac.r) || null,
    type: clean(ac.t) || null,
    description: clean(ac.desc) || null,
    lat: Number(ac.lat),
    lon: Number(ac.lon),
    altitude_ft: ac.alt_baro === 'ground' ? 0 : Number(ac.alt_baro ?? ac.alt_geom ?? 0),
    ground_speed_kt: ac.gs == null ? null : Math.round(Number(ac.gs)),
    track_deg: ac.track == null ? null : Math.round(Number(ac.track)),
    vertical_rate_fpm: ac.baro_rate ?? ac.geom_rate ?? null,
    squawk: clean(ac.squawk) || null,
    emergency: ac.emergency || 'none',
    distance_nm: ac.dst == null ? null : Math.round(Number(ac.dst) * 10) / 10,
    bearing_deg: ac.dir == null ? null : Math.round(Number(ac.dir)),
    seen_seconds: ac.seen == null ? null : Math.round(Number(ac.seen)),
  };
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const radius = Math.min(80, Math.max(5, Number(url.searchParams.get('radius_nm') || DEFAULT_RADIUS_NM)));
  const center = {
    icao: (url.searchParams.get('icao') || DEFAULT_CENTER.icao).toUpperCase(),
    lat: Number(url.searchParams.get('lat') || DEFAULT_CENTER.lat),
    lon: Number(url.searchParams.get('lon') || DEFAULT_CENTER.lon),
  };
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lon)) {
    return json({ error: 'lat and lon must be valid numbers' }, { status: 400 });
  }
  const feedUrl = `${ADSB_FI_URL}/lat/${center.lat}/lon/${center.lon}/dist/${radius}`;
  const res = await fetch(feedUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'preflight-dashboard/1.0',
    },
  });

  if (!res.ok) return json({ error: `ADS-B feed returned ${res.status}` }, { status: 502 });
  const body = await res.json();
  const aircraft = (body.ac || [])
    .filter((ac) => Number.isFinite(Number(ac.lat)) && Number.isFinite(Number(ac.lon)))
    .map(normalizeAircraft)
    .sort((a, b) => (a.distance_nm ?? 999) - (b.distance_nm ?? 999));

  return json(
    {
      fetched_utc: new Date().toISOString(),
      source: 'adsb.fi',
      center,
      radius_nm: radius,
      count: aircraft.length,
      aircraft,
    },
    { headers: { 'Cache-Control': 'public, max-age=10' } },
  );
};
