import { getStore } from '@netlify/blobs';
import { requireAuth, json } from './_auth.js';

const NOTAM_URL = 'https://external-api.faa.gov/notamapi/v1/notams';

function normalizeNotam(item) {
  // The FAA NOTAM API has changed response shapes over time. Check several
  // likely fields and return one stable shape to the UI.
  const text = item.icaoMessage || item.traditionalMessage || item.text || item.summary || item.raw || '';
  return {
    id: item.notamNumber || item.id || item.number || 'unknown',
    classification: item.classification || item.notamType || item.type || '',
    summary: item.summary || item.icaoMessage || text.split('\n')[0] || '',
    raw: text,
    effective_from_utc: item.effectiveStart || item.startDate || item.effective_from_utc || null,
    effective_to_utc: item.effectiveEnd || item.endDate || item.effective_to_utc || null,
  };
}

async function cachedResult(store, icao) {
  return store.get(`notams_${icao}`, { type: 'json' });
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const icao = (url.searchParams.get('icao') || 'KVBT').toUpperCase();
  const store = getStore({ name: 'config' });
  const clientId = process.env.FAA_NOTAM_CLIENT_ID;
  const clientSecret = process.env.FAA_NOTAM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Local/dev deployments may not have FAA credentials. Cached data is better
    // than an empty panel when available, but mark it stale for the UI.
    const cached = await cachedResult(store, icao);
    if (cached) return json({ ...cached, stale: true });
    return json({ fetched_utc: new Date().toISOString(), count: 0, notams: [], warning: 'FAA NOTAM credentials are not configured' });
  }

  try {
    const res = await fetch(`${NOTAM_URL}?icaoLocation=${icao}&pageSize=20`, {
      headers: {
        client_id: clientId,
        client_secret: clientSecret,
      },
    });
    if (!res.ok) throw new Error(`FAA NOTAM API returned ${res.status}`);
    const body = await res.json();
    // Accept array and paginated response shapes so a minor FAA envelope change
    // does not break the panel outright.
    const records = body.items || body.notams || body.content || (Array.isArray(body) ? body : []);
    const payload = {
      fetched_utc: new Date().toISOString(),
      count: records.length,
      notams: records.map(normalizeNotam),
    };
    await store.setJSON(`notams_${icao}`, payload);
    return json(payload);
  } catch (error) {
    const cached = await cachedResult(store, icao);
    if (cached) return json({ ...cached, stale: true, error: error.message });
    return json({ error: error.message }, { status: 502 });
  }
};
