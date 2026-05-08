import { requireAuth, json } from './_auth.js';

const METAR_URL = 'https://aviationweather.gov/api/data/metar';
const TAF_URL = 'https://aviationweather.gov/api/data/taf';
const WINDS_URL = 'https://aviationweather.gov/api/data/windtemp?region=nc&level=low&fcst=06';
const GAIRMET_URL = 'https://aviationweather.gov/api/data/gairmet?format=json';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

function visibility(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.endsWith('+')) return Number(value.slice(0, -1));
  return Number(value);
}

function altimeterInHg(metar) {
  if (metar.altim == null) return null;
  return Math.round((Number(metar.altim) / 33.8639) * 100) / 100;
}

function normalizeMetar(metar) {
  if (!metar) return null;
  const clouds = Array.isArray(metar.clouds) ? metar.clouds : [];
  const ceiling = clouds.find((cloud) => ['BKN', 'OVC', 'VV'].includes(cloud.cover));
  const windDir = Number(metar.wdir);
  return {
    raw: metar.rawOb || '',
    wind_dir_deg: Number.isFinite(windDir) ? windDir : null,
    wind_speed_kt: Number(metar.wspd || 0),
    wind_gust_kt: metar.wgst == null ? null : Number(metar.wgst),
    visibility_sm: visibility(metar.visib),
    sky_condition: metar.cover || clouds.map((cloud) => `${cloud.cover}${cloud.base || ''}`).join(' ') || 'Unknown',
    ceiling_ft: ceiling?.base || null,
    temp_c: metar.temp == null ? null : Number(metar.temp),
    dewpoint_c: metar.dewp == null ? null : Number(metar.dewp),
    altimeter_inhg: altimeterInHg(metar),
    flight_category: metar.fltCat || 'Unknown',
    observed_utc: metar.reportTime || metar.receiptTime || null,
  };
}

function normalizeTaf(taf) {
  if (!taf) return { raw: '', issued_utc: null, periods: [] };
  const periods = Array.isArray(taf.fcsts) ? taf.fcsts : Array.isArray(taf.forecast) ? taf.forecast : [];
  return {
    raw: taf.rawTAF || taf.rawTaf || taf.rawOb || '',
    issued_utc: taf.issueTime || taf.reportTime || null,
    periods: periods.slice(0, 6).map((period) => ({
      from_utc: period.timeFrom || period.validFrom || period.fcstTimeFrom || null,
      to_utc: period.timeTo || period.validTo || period.fcstTimeTo || null,
      wind_dir_deg: Number.isFinite(Number(period.wdir)) ? Number(period.wdir) : null,
      wind_speed_kt: Number(period.wspd || 0),
      visibility_sm: visibility(period.visib),
      sky_condition: period.cover || period.clouds?.map?.((cloud) => `${cloud.cover}${cloud.base || ''}`).join(' ') || '',
      flight_category: period.fltCat || '',
    })),
  };
}

function parseWindsAloft(rows, icao) {
  const row = Array.isArray(rows) ? rows.find((item) => item.station === icao || item.icaoId === icao || item.id === icao) : null;
  if (!row) return {};
  const result = {};
  [
    ['3000_ft', ['wind3000', 'wdir3000', 'wspd3000', 'temp3000']],
    ['6000_ft', ['wind6000', 'wdir6000', 'wspd6000', 'temp6000']],
    ['9000_ft', ['wind9000', 'wdir9000', 'wspd9000', 'temp9000']],
  ].forEach(([label, [codeKey, dirKey, speedKey, tempKey]]) => {
    if (row[codeKey] && typeof row[codeKey] === 'string') {
      const code = row[codeKey];
      result[label] = { dir_deg: Number(code.slice(0, 2)) * 10, speed_kt: Number(code.slice(2, 4)), temp_c: Number(code.slice(4)) || null };
    } else if (row[dirKey] || row[speedKey]) {
      result[label] = { dir_deg: Number(row[dirKey]), speed_kt: Number(row[speedKey]), temp_c: row[tempKey] == null ? null : Number(row[tempKey]) };
    }
  });
  return result;
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const icao = (url.searchParams.get('icao') || 'KVBT').toUpperCase();
  const [metars, tafs, winds, gairmets] = await Promise.all([
    fetchJson(`${METAR_URL}?ids=${icao}&format=json&taf=false`),
    fetchJson(`${TAF_URL}?ids=${icao}&format=json`),
    fetchJson(WINDS_URL).catch(() => []),
    fetchJson(GAIRMET_URL).catch(() => []),
  ]);

  return json(
    {
      fetched_utc: new Date().toISOString(),
      metar: normalizeMetar(metars[0]),
      taf: normalizeTaf(tafs[0]),
      winds_aloft: parseWindsAloft(winds, icao),
      gairmets: Array.isArray(gairmets) ? gairmets : [],
    },
    { headers: { 'Cache-Control': 'public, max-age=180' } },
  );
};
