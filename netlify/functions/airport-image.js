import { requireAuth, json } from './_auth.js';

const KVBT_IMAGE = 'https://images.squarespace-cdn.com/content/v1/67f3ee1006d37e724190ac27/2eac87a2-5c81-4d45-a6ea-e56aca8203ad/Thaden-Exteriors-HR-007.jpg';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

function normalizeIcao(value) {
  const input = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (input.length === 3) return `K${input}`;
  return input || 'KVBT';
}

function airportImageSearches(icao, name) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  const searches = [
    cleanName ? `${cleanName} airport` : '',
    `${icao} airport`,
    icao.startsWith('K') ? `${icao.slice(1)} airport` : '',
  ].filter(Boolean);
  return [...new Set(searches)];
}

function scorePage(page, icao, name) {
  const title = String(page.title || '');
  const upperTitle = title.toUpperCase();
  const shortCode = icao.replace(/^K/, '');
  const nameWords = String(name || '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word.length > 3)
    .slice(0, 4);

  let score = 0;
  if (/AIRPORT|AIR FIELD|AIRFIELD|AERODROME/i.test(title)) score += 5;
  if (upperTitle.includes(icao) || upperTitle.includes(shortCode)) score += 3;
  score += nameWords.filter((word) => upperTitle.includes(word)).length;
  return score;
}

async function wikipediaImageFor(search, icao, name) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: search,
    gsrlimit: '8',
    prop: 'pageimages|info',
    inprop: 'url',
    piprop: 'thumbnail|original',
    pithumbsize: '1800',
    format: 'json',
  });
  const res = await fetch(`${WIKIPEDIA_API}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'preflight-dashboard/1.0',
    },
  });
  if (!res.ok) throw new Error(`${res.status} Wikipedia image search failed`);
  const body = await res.json();
  const pages = Object.values(body.query?.pages || {})
    .filter((page) => page.thumbnail?.source || page.original?.source)
    .map((page) => ({ ...page, score: scorePage(page, icao, name) }))
    .sort((a, b) => b.score - a.score);
  const page = pages.find((candidate) => candidate.score > 0) || pages[0];
  if (!page) return null;
  return {
    image_url: page.thumbnail?.source || page.original?.source,
    source_label: 'Wikipedia / Wikimedia Commons',
    source_url: page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`,
    title: page.title,
  };
}

export default async (req) => {
  const auth = requireAuth(req.headers);
  if (!auth.ok) return json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const icao = normalizeIcao(url.searchParams.get('icao'));
  const name = url.searchParams.get('name') || '';

  if (icao === 'KVBT') {
    return json(
      {
        image_url: KVBT_IMAGE,
        source_label: 'Legends Air Center',
        source_url: 'https://legendsaircenter.com/',
      },
      { headers: { 'Cache-Control': 'public, max-age=604800' } },
    );
  }

  for (const search of airportImageSearches(icao, name)) {
    const image = await wikipediaImageFor(search, icao, name).catch(() => null);
    if (image?.image_url) {
      return json(image, { headers: { 'Cache-Control': 'public, max-age=604800' } });
    }
  }

  return json(
    {
      image_url: null,
      source_label: null,
      source_url: null,
    },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
};
