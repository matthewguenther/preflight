import { requireAuth, json } from './_auth.js';

const API_BASE = 'https://aviationweather.gov/api/data';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'preflight-dashboard/1.0',
    },
  });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,text/plain',
      'User-Agent': 'preflight-dashboard/1.0',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function normalizeIcao(value) {
  const input = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (input.length === 3) return `K${input}`;
  return input || 'KVBT';
}

function distanceNm(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDeg(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const dLon = (b.lon - a.lon) * rad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function runwayEndHeading(id, fallback) {
  const primary = String(id || '').split('/')[0];
  const numeric = Number(primary.replace(/[^\d]/g, ''));
  if (Number.isFinite(numeric) && numeric > 0) return numeric === 36 ? 360 : numeric * 10;
  return Number(fallback) || 0;
}

function oppositeHeading(heading) {
  return ((Number(heading) + 180 - 1) % 360) + 1;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&deg;/g, ' deg ');
}

function htmlToText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|tr|td|div|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n'))
    .trim();
}

function normalizeFrequencyLabel(label) {
  return String(label || '')
    .replace(/\s+/g, ' ')
    .replace(/^WX\s+/i, 'WX ')
    .trim()
    .toUpperCase();
}

function parseAviationWeatherFreqs(freqs) {
  const raw = String(freqs || '').trim();
  if (!raw || raw === '-') return [];
  return raw
    .split(';')
    .map((item) => {
      const parts = item.split(',').map((part) => part.trim()).filter(Boolean);
      if (!parts.length) return null;
      return {
        label: normalizeFrequencyLabel(parts[0]),
        value: parts.slice(1).join(', ') || parts[0],
      };
    })
    .filter(Boolean);
}

function parseAirnavFrequencies(html) {
  const text = htmlToText(html);
  const section = text.match(/Airport Communications([\s\S]*?)(?:Nearby radio navigation aids|Airport Services|Runway Information|Instrument Procedures|Airport Operational Statistics)/i)?.[1] || '';
  if (!section) return [];

  const frequencyPattern = /\b1(?:1[89]|2\d|3[0-6])\.\d{1,3}\b/;
  const lines = section.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const compact = section.replace(/\s+/g, ' ').trim();
  const rows = [];
  const uniqueRows = (items) => {
    const seen = new Set();
    return items.filter((row) => {
      const key = `${row.label}:${row.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineMatch = lines[index].match(/^([A-Z][A-Z0-9 /&().-]{1,64}?):\s*(.*)$/i);
    if (!lineMatch) continue;
    const label = normalizeFrequencyLabel(lineMatch[1]);
    const value = (lineMatch[2] || lines[index + 1] || '').replace(/\s+/g, ' ').trim();
    const isNearbyWeather = /\bat\s+[A-Z0-9]{3,4}\b/i.test(label);
    if (frequencyPattern.test(value) && !isNearbyWeather) {
      rows.push({
        label,
        value: value.slice(0, 120),
      });
    }
  }
  if (rows.length) return uniqueRows(rows);

  const rowPattern = /([A-Z][A-Z0-9 /&().-]{1,64}?):\s*([\s\S]*?)(?=\s+[A-Z][A-Z0-9 /&().-]{1,64}?:|$)/g;
  let match = rowPattern.exec(compact);
  while (match) {
    const label = normalizeFrequencyLabel(match[1]);
    const value = match[2].replace(/\s+/g, ' ').trim();
    const hasVhfFrequency = frequencyPattern.test(value);
    const isNearbyWeather = /\bat\s+[A-Z0-9]{3,4}\b/i.test(label);
    if (hasVhfFrequency && !isNearbyWeather) {
      rows.push({
        label,
        value: value.slice(0, 120),
      });
    }
    match = rowPattern.exec(compact);
  }

  return uniqueRows(rows);
}

function parseSkyVectorFrequencies(html) {
  const table = String(html || '').match(/<table[^>]+id=["']aptcomms["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] || '';
  if (!table) return [];
  const rows = [];
  const frequencyPattern = /\b1(?:1[89]|2\d|3[0-6])\.\d{1,3}\b/;
  const rowPattern = /<tr[\s\S]*?<th[^>]*>([\s\S]*?):?<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  let match = rowPattern.exec(table);
  while (match) {
    const label = normalizeFrequencyLabel(htmlToText(match[1]).replace(/:$/, ''));
    const value = htmlToText(match[2]).replace(/\s+/g, ' ').trim();
    const isNearbyWeather = /\bat\s+[A-Z0-9]{3,4}\b/i.test(label);
    if (frequencyPattern.test(value) && !isNearbyWeather) {
      rows.push({ label, value });
    }
    match = rowPattern.exec(table);
  }
  return rows;
}

function normalizeAirport(airport, station, icao) {
  const source = airport || station || {};
  const lat = Number(source.lat);
  const lon = Number(source.lon);
  const runways = Array.isArray(airport?.runways)
    ? airport.runways.map((runway) => {
        const heading = runwayEndHeading(runway.id, runway.alignment);
        const [length_ft, width_ft] = String(runway.dimension || '').split('x').map((value) => Number(value));
        return {
          id: runway.id,
          length_ft: Number.isFinite(length_ft) ? length_ft : null,
          width_ft: Number.isFinite(width_ft) ? width_ft : null,
          surface: runway.surface || null,
          headings: [heading, oppositeHeading(heading)],
        };
      })
    : [];

  return {
    icao: airport?.icaoId || station?.icaoId || icao,
    faa_id: airport?.faaId || station?.faaId || null,
    iata_id: airport?.iataId && airport.iataId !== '-' ? airport.iataId : station?.iataId || null,
    name: (airport?.name || station?.site || airport?.icaoId || icao).trim(),
    city: station?.site || airport?.name?.split('/')?.[0]?.trim() || '',
    state: airport?.state || station?.state || '',
    country: airport?.country || station?.country || '',
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    elevation_ft: airport?.elev != null
      ? Math.round(Number(airport.elev) * 3.28084)
      : station?.elev != null
        ? Math.round(Number(station.elev) * 3.28084)
        : null,
    towered: airport?.tower === 'T',
    services: airport?.services || null,
    beacon: airport?.beacon || null,
    freqs: airport?.freqs || '-',
    frequencies: parseAviationWeatherFreqs(airport?.freqs),
    runways,
    source: airport?.source || 'AviationWeather',
  };
}

async function frequencyFallback(airport) {
  const id = airport?.icao || airport?.faa_id;
  if (!id) return null;
  const skyVectorId = airport?.faa_id || airport?.icao?.replace(/^K/, '') || id;
  const providers = [
    {
      label: 'SkyVector airport communications',
      url: `https://skyvector.com/airport/${encodeURIComponent(skyVectorId)}`,
      parse: parseSkyVectorFrequencies,
    },
    {
      label: 'AirNav airport communications',
      url: `https://www.airnav.com/airport/${encodeURIComponent(id)}`,
      parse: parseAirnavFrequencies,
    },
  ];

  for (const provider of providers) {
    try {
      const html = await fetchText(provider.url);
      const frequencies = provider.parse(html);
      if (frequencies.length) return { frequencies, source: { label: provider.label, url: provider.url } };
    } catch {
      // Try the next public airport reference source.
    }
  }
  return null;
}

async function alternatesFor(airport) {
  if (!airport.lat || !airport.lon) return [];
  const delta = 0.65;
  const bbox = `${airport.lat - delta},${airport.lon - delta},${airport.lat + delta},${airport.lon + delta}`;
  const stations = await fetchJson(`${API_BASE}/stationinfo?bbox=${encodeURIComponent(bbox)}&format=json`).catch(() => []);
  const nearby = (Array.isArray(stations) ? stations : [])
    .filter((station) => station.icaoId && station.icaoId !== airport.icao && Number.isFinite(Number(station.lat)) && Number.isFinite(Number(station.lon)))
    .map((station) => {
      const point = { lat: Number(station.lat), lon: Number(station.lon) };
      return {
        icao: station.icaoId,
        name: station.site,
        state: station.state,
        distance_nm: Math.round(distanceNm(airport, point) * 10) / 10,
        bearing_deg: bearingDeg(airport, point),
      };
    })
    .sort((a, b) => a.distance_nm - b.distance_nm)
    .slice(0, 6);

  if (!nearby.length) return [];
  const metars = await fetchJson(`${API_BASE}/metar?ids=${nearby.map((item) => item.icao).join(',')}&format=json&taf=false`).catch(() => []);
  const metarById = new Map((Array.isArray(metars) ? metars : []).map((metar) => [metar.icaoId, metar]));
  return nearby.map((alternate) => ({
    ...alternate,
    flight_category: metarById.get(alternate.icao)?.fltCat || null,
    wind_kt: metarById.get(alternate.icao)?.wspd == null ? null : Number(metarById.get(alternate.icao).wspd),
  }));
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const icao = normalizeIcao(url.searchParams.get('icao'));
  const [airports, stations] = await Promise.all([
    fetchJson(`${API_BASE}/airport?ids=${icao}&format=json`),
    fetchJson(`${API_BASE}/stationinfo?ids=${icao}&format=json`),
  ]);
  const airport = normalizeAirport(airports[0], stations[0], icao);
  if (!airport.lat || !airport.lon) return json({ error: `Airport ${icao} was not found` }, { status: 404 });
  const fallback = airport.frequencies.length ? null : await frequencyFallback(airport);
  if (fallback) {
    airport.frequencies = fallback.frequencies;
    airport.frequency_source = fallback.source.label;
  }
  const sources = [{ label: 'Airport/station data', url: 'https://aviationweather.gov/data/api/' }];
  if (fallback?.source) sources.push(fallback.source);

  return json(
    {
      fetched_utc: new Date().toISOString(),
      airport,
      alternates: await alternatesFor(airport),
      sources,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};
