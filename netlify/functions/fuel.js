import { requireAuth, json } from './_auth.js';

const LOCAL_URL = 'https://www.airnav.com/airport/KVBT/LEGENDS_AIR_CENTER';
const REPORT_URL = 'https://www.airnav.com/fuel/report.html';
const MARKET_TREND_URL = 'https://generalaviationnews.com/2026/05/07/aviation-fuel-prices-up-again-in-april/';

const FALLBACK = {
  local: {
    fbo: 'Legends Air Center',
    airport: 'KVBT',
    updated: '28-Apr-2026',
    fuels: [
      { code: '100LL', label: '100LL Avgas', service: 'Full service', price_per_gal: 6.61 },
      { code: 'JET_A', label: 'Jet A', service: 'Full service', price_per_gal: 6.61 },
    ],
  },
  market: {
    prepared: '08-May-2026',
    region: 'Southern',
    regional: {
      '100LL': { avg: 6.78, min: 4.15, max: 11.48 },
      JET_A: { avg: 7.19, min: 3.5, max: 12.31 },
    },
    nationwide: {
      '100LL': { avg: 6.78, min: 3.9, max: 17.0 },
      JET_A: { avg: 7.24, min: 3.1, max: 15.0 },
    },
  },
};

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'preflight-dashboard/1.0',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLocal(html) {
  const text = htmlToText(html);
  const updated = /Fuel prices as last reported on\s+([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i.exec(text)?.[1] || FALLBACK.local.updated;
  const avgas = /100LL Avgas\s+Full service\s+\$([0-9.]+)/i.exec(text)?.[1];
  const jetA = /Jet A\s+Full service\s+\$([0-9.]+)/i.exec(text)?.[1];

  return {
    ...FALLBACK.local,
    updated,
    fuels: [
      { ...FALLBACK.local.fuels[0], price_per_gal: number(avgas) ?? FALLBACK.local.fuels[0].price_per_gal },
      { ...FALLBACK.local.fuels[1], price_per_gal: number(jetA) ?? FALLBACK.local.fuels[1].price_per_gal },
    ],
  };
}

function parseMarketRow(text, label) {
  const match = new RegExp(
    `${label}\\s+\\d+\\s+\\d+\\s+\\$([0-9.]+)\\s+\\$([0-9.]+)\\s+\\$([0-9.]+)\\s+\\d+\\s+\\$([0-9.]+)\\s+\\$([0-9.]+)\\s+\\$([0-9.]+)`,
    'i',
  ).exec(text);

  if (!match) return null;
  return {
    '100LL': { avg: number(match[1]), min: number(match[2]), max: number(match[3]) },
    JET_A: { avg: number(match[4]), min: number(match[5]), max: number(match[6]) },
  };
}

function parseMarket(html) {
  const text = htmlToText(html);
  const prepared = /This report prepared by AirNav on\s+([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i.exec(text)?.[1] || FALLBACK.market.prepared;
  const regional = parseMarketRow(text, 'Southern') || FALLBACK.market.regional;
  const nationwide = parseMarketRow(text, 'Nationwide') || FALLBACK.market.nationwide;

  return {
    prepared,
    region: FALLBACK.market.region,
    regional,
    nationwide,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addIndex(fuel, market) {
  const reference = market.regional[fuel.code];
  const deltaPct = reference?.avg ? ((fuel.price_per_gal - reference.avg) / reference.avg) * 100 : 0;
  const status = deltaPct <= -5 ? 'below average' : deltaPct >= 5 ? 'above average' : 'near average';
  return {
    ...fuel,
    regional_avg: reference?.avg ?? null,
    national_avg: market.nationwide[fuel.code]?.avg ?? null,
    market_delta_pct: Math.round(deltaPct * 10) / 10,
    market_status: status,
    index_position_pct: clamp(50 + deltaPct * 2, 4, 96),
  };
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  let local = FALLBACK.local;
  let market = FALLBACK.market;
  const warnings = [];

  const [localResult, reportResult] = await Promise.allSettled([fetchText(LOCAL_URL), fetchText(REPORT_URL)]);
  if (localResult.status === 'fulfilled') {
    local = parseLocal(localResult.value);
  } else {
    warnings.push('Local fuel page unavailable; using last known KVBT prices.');
  }
  if (reportResult.status === 'fulfilled') {
    market = parseMarket(reportResult.value);
  } else {
    warnings.push('Market fuel report unavailable; using last known regional averages.');
  }

  return json(
    {
      fetched_utc: new Date().toISOString(),
      local: {
        ...local,
        fuels: local.fuels.map((fuel) => addIndex(fuel, market)),
      },
      market: {
        ...market,
        trend: {
          label: 'National GA fuel pressure',
          direction: 'rising',
          summary: 'Latest reported nationwide GA fuel pricing moved higher in April 2026.',
          source_url: MARKET_TREND_URL,
        },
      },
      sources: [
        { label: 'AirNav KVBT FBO fuel prices', url: LOCAL_URL },
        { label: 'AirNav fuel price report', url: REPORT_URL },
        { label: 'iFlightPlanner April trend summary via General Aviation News', url: MARKET_TREND_URL },
      ],
      warnings,
    },
    { headers: { 'Cache-Control': 'public, max-age=900' } },
  );
};
