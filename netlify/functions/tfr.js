import { requireAuth, json } from './_auth.js';

const KVBT = { lat: 36.3444, lon: -94.2211 };
const TFR_URL = 'https://tfr.faa.gov/tfrapi/exportTfrList';

function distanceNm(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(3440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function coordinatesFrom(record) {
  if (record.lat && record.lon) return { lat: Number(record.lat), lon: Number(record.lon) };
  if (record.latitude && record.longitude) return { lat: Number(record.latitude), lon: Number(record.longitude) };
  const coords = record.geometry?.coordinates;
  if (Array.isArray(coords) && typeof coords[0] === 'number') return { lon: Number(coords[0]), lat: Number(coords[1]) };
  if (Array.isArray(coords)) {
    const pairs = [];
    const visit = (value) => {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        pairs.push(value);
        return;
      }
      value.forEach(visit);
    };
    visit(coords);
    if (pairs.length) {
      const summed = pairs.reduce((acc, item) => ({ lon: acc.lon + Number(item[0]), lat: acc.lat + Number(item[1]) }), { lat: 0, lon: 0 });
      return { lat: summed.lat / pairs.length, lon: summed.lon / pairs.length };
    }
  }
  return null;
}

function normalize(record, distance) {
  return {
    id: record.notam_id || record.id || record.notamId || 'unknown',
    type: record.type || record.tfr_type || 'TFR',
    summary: record.description || record.summary || record.title || '',
    distance_nm: distance,
    ceiling_ft: Number(record.ceiling_ft || record.ceiling || record.upper_altitude || 0) || null,
    floor_ft: Number(record.floor_ft || record.floor || record.lower_altitude || 0) || 0,
    active: record.active !== false,
    effective_from_utc: record.effective_from_utc || record.startDate || record.start_date || null,
    effective_to_utc: record.effective_to_utc || record.endDate || record.end_date || null,
  };
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  const res = await fetch(TFR_URL);
  if (!res.ok) return json({ error: `TFR feed returned ${res.status}` }, { status: 502 });
  const records = await res.json();
  const tfrs = Array.isArray(records) ? records : records.features || [];
  const nearby = tfrs
    .map((record) => {
      const source = record.properties ? { ...record.properties, geometry: record.geometry } : record;
      const coords = coordinatesFrom(source);
      if (!coords) return null;
      const distance = distanceNm(KVBT, coords);
      return distance <= 100 ? normalize(source, distance) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distance_nm - b.distance_nm);

  return json({ fetched_utc: new Date().toISOString(), tfrs_nearby: nearby });
};
