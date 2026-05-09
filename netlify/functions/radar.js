import { requireAuth, json } from './_auth.js';

const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  const res = await fetch(RAINVIEWER_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'preflight-dashboard/1.0',
    },
  });

  if (!res.ok) {
    return json({ error: `RainViewer returned ${res.status}` }, { status: 502 });
  }

  const body = await res.json();
  const past = Array.isArray(body.radar?.past) ? body.radar.past : [];
  // RainViewer returns a list of past radar frames. The UI only needs the most
  // recent path and the host so it can assemble map tile URLs.
  const latest = past[past.length - 1] || null;

  return json(
    {
      fetched_utc: new Date().toISOString(),
      generated_utc: body.generated ? new Date(body.generated * 1000).toISOString() : null,
      source: 'RainViewer',
      source_url: 'https://www.rainviewer.com/api/weather-maps-api.html',
      host: body.host || 'https://tilecache.rainviewer.com',
      radar: latest
        ? {
            time_utc: new Date(latest.time * 1000).toISOString(),
            path: latest.path,
          }
        : null,
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
};
