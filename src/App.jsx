import {
  AlertTriangle,
  Bell,
  Cloud,
  Compass,
  Database,
  ExternalLink,
  Fuel,
  Gauge,
  Headphones,
  MapPin,
  Search,
  Wind,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AirportPrompt } from './components/AirportPrompt';
import { TrafficScope } from './components/panels/TrafficScope';
import { useAirport, normalizeAirportCode } from './hooks/useAirport';
import { useAirportImage } from './hooks/useAirportImage';
import { useBlob } from './hooks/useBlobs';
import { useFuel } from './hooks/useFuel';
import { useNotams } from './hooks/useNotams';
import { useRadar } from './hooks/useRadar';
import { useTfr } from './hooks/useTfr';
import { useTraffic } from './hooks/useTraffic';
import { useWeather } from './hooks/useWeather';
import { densityAltitude } from './lib/densityAlt';
import { getRecentAirports, addRecentAirport } from './lib/recentAirports';
import { formatLocal } from './lib/time';

const HERO_IMAGE = 'https://images.squarespace-cdn.com/content/v1/67f3ee1006d37e724190ac27/2eac87a2-5c81-4d45-a6ea-e56aca8203ad/Thaden-Exteriors-HR-007.jpg';
const RADAR_ZOOM = 7;
const TILE_SIZE = 256;
const STATE_NAMES = {
  AR: 'Arkansas',
  OK: 'Oklahoma',
  MO: 'Missouri',
  TX: 'Texas',
  KS: 'Kansas',
  CA: 'California',
  FL: 'Florida',
  NY: 'New York',
};
const FREQUENCY_FALLBACKS = {
  KVBT: [
    { label: 'CTAF/UNICOM', value: '122.975' },
    { label: 'WX AWOS-3PT', value: '134.975' },
    { label: 'RAZORBACK APPROACH', value: '121.0' },
    { label: 'RAZORBACK DEPARTURE', value: '121.0' },
    { label: 'CLEARANCE DELIVERY', value: '121.05' },
  ],
};

// Most of this file is intentionally self-contained: the dashboard cards share
// small formatting and aviation helpers without forcing a broad component tree.
function money(value) {
  return value == null ? '--' : `$${Number(value).toFixed(2)}`;
}

function signedPct(value) {
  if (value == null) return '--';
  const rounded = Math.abs(Number(value)).toFixed(1);
  return `${Number(value) > 0 ? '+' : Number(value) < 0 ? '-' : ''}${rounded}%`;
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bNtl\b/g, 'National')
    .replace(/\bMuni\b/g, 'Municipal')
    .replace(/\bFld\b/g, 'Field');
}

function airportName(airport) {
  if (!airport) return 'Airport';
  const raw = airport.name || airport.city || airport.icao;
  const parts = raw.split('/').map((item) => titleCase(item.trim())).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' / ') : parts[0] || airport.icao;
}

function airportPlace(airport) {
  if (!airport) return '';
  const city = titleCase(airport.city?.split('/')?.[0] || airport.name?.split('/')?.[0] || '');
  const state = STATE_NAMES[airport.state] || airport.state || airport.country || '';
  return [city, state].filter(Boolean).join(', ');
}

function airportFrequencies(airport) {
  // Preferred path: the airport function already normalized frequencies into
  // { label, value }. The parsing below is a backup for raw AviationWeather
  // semicolon strings and the hard-coded KVBT rescue list.
  if (Array.isArray(airport?.frequencies) && airport.frequencies.length) {
    return airport.frequencies.filter((item) => item?.label || item?.value);
  }
  const parsed = String(airport?.freqs || '-')
    .split(';')
    .map((item) => {
      const parts = item.split(',').map((part) => part.trim()).filter(Boolean);
      if (!parts.length || parts[0] === '-') return null;
      return {
        label: parts[0].toUpperCase(),
        value: parts.slice(1).join(', ') || parts[0],
      };
    })
    .filter(Boolean);
  if (parsed.length) return parsed;
  return airport?.icao ? FREQUENCY_FALLBACKS[normalizeAirportCode(airport.icao)] || [] : [];
}

function skyVectorUrl(airport) {
  const id = airport?.faa_id || airport?.icao?.replace(/^K/, '') || airport?.icao || '';
  return `https://skyvector.com/airport/${encodeURIComponent(id)}`;
}

function liveAtcUrl(airport) {
  return `https://www.liveatc.net/search/?icao=${encodeURIComponent(String(airport?.icao || 'KVBT').toLowerCase())}`;
}

function aviationWeatherUrl(airport) {
  return `https://aviationweather.gov/data/metar/?id=${encodeURIComponent(airport?.icao || 'KVBT')}&hours=0&taf=on`;
}

function faaNotamSearchUrl(airport) {
  return `https://notams.aim.faa.gov/notamSearch/nsapp.html#/${encodeURIComponent(airport?.icao || 'KVBT')}`;
}

function lonLatToWorld(lat, lon, zoom = RADAR_ZOOM) {
  // Converts WGS84 lat/lon into the same Web Mercator pixel space used by
  // OpenStreetMap/RainViewer tiles. This lets us position weather tiles around
  // the airport without importing a map library.
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function timeAgo(utcIso) {
  if (!utcIso) return 'Unavailable';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(utcIso).getTime()) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hr ago`;
  return formatLocal(utcIso, 'MMM d, h:mm a');
}

function feedStatus(query, timestamp, staleAfterMs) {
  // React Query knows whether a request is loading/error; the timestamp tells
  // us whether an otherwise successful feed is aging out operationally.
  if (query.isError) return { tone: 'error', label: 'Unavailable' };
  if (query.isLoading) return { tone: 'loading', label: 'Loading' };
  if (!timestamp) return { tone: 'warning', label: 'No timestamp' };
  const age = Date.now() - new Date(timestamp).getTime();
  return {
    tone: age > staleAfterMs ? 'warning' : 'live',
    label: age > staleAfterMs ? `Stale ${timeAgo(timestamp)}` : timeAgo(timestamp),
  };
}

function cardinal(value) {
  if (value == null) return '--';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(Number(value) / 45) % 8];
}

function runwayEnds(airport) {
  // Airport runways arrive as physical runways ("18/36") with one heading per
  // end. Flattening them into runway ends lets the wind logic compare every
  // usable direction independently, which matters at multi-runway airports.
  return (airport?.runways || []).flatMap((runway) => {
    const ids = String(runway.id || '').split('/');
    return (runway.headings || []).map((heading, index) => ({
      runway,
      id: ids[index] || `${Math.round(heading / 10)}`,
      heading,
    }));
  });
}

function windComponents(windDir, windSpeed, runwayHeading) {
  // Positive headwind means wind is helping the selected runway end. A negative
  // value is a tailwind; crosswind is absolute because left/right side does not
  // matter for the personal-minimum comparison shown here.
  if (windDir == null || runwayHeading == null) return { headwind: 0, crosswind: 0 };
  const angle = Math.abs(Number(windDir) - Number(runwayHeading));
  const wrapped = angle > 180 ? 360 - angle : angle;
  const radians = (wrapped * Math.PI) / 180;
  return {
    headwind: Math.round(Number(windSpeed || 0) * Math.cos(radians) * 10) / 10,
    crosswind: Math.round(Math.abs(Number(windSpeed || 0) * Math.sin(radians)) * 10) / 10,
  };
}

function runwayWindOptions(airport, metar) {
  const ends = runwayEnds(airport);
  if (!ends.length) return [];
  return ends
    .map((end) => ({ ...end, ...windComponents(metar?.wind_dir_deg, metar?.wind_speed_kt, end.heading) }))
    // Pilots generally prefer the greatest headwind component. If two runway
    // ends have equal headwind, lower crosswind is the tie-breaker.
    .sort((a, b) => b.headwind - a.headwind || a.crosswind - b.crosswind || String(a.id).localeCompare(String(b.id)));
}

function severeWeather(raw = '') {
  // Lightweight METAR token scan for the hero SITREP. The deeper go/no-go
  // module has similar logic but returns individual condition rows.
  const text = String(raw).toUpperCase();
  if (/(?:^|\s)(?:TS|TSRA|VCTS|\+RA|\+SHRA|FZRA|FZDZ|SQ|FC|GR|GS|WS)(?=\s|$)/.test(text)) return 'fail';
  if (/(?:^|\s)(?:LTG|CB|TCU|-?RA|SHRA|DZ)(?=\s|$)/.test(text)) return 'caution';
  return 'clear';
}

function classifyNotam(notam) {
  // NOTAM text varies by source, so broad regex buckets are used for triage.
  // The raw NOTAM is still shown in details for pilot verification.
  const text = `${notam.summary || ''} ${notam.raw || ''}`.toUpperCase();
  if (/(AD|AP|RWY|RUNWAY).*(CLSD|CLOSED)|CLSD.*(RWY|RUNWAY|AD|AP)/.test(text)) return 'Critical';
  if (/(RWY|RUNWAY|TWY|TAXIWAY|RAMP|APRON|CONSTRUCTION|WORK|CRANE|OBST|EQUIPMENT|MEN)/.test(text)) return 'Operational';
  if (/(PAPI|VASI|ILS|LOC|GS|VOR|NDB|RNAV|GPS|NAV|LIGHT|LGT|MALSR|REIL|APPROACH)/.test(text)) return 'Navigation';
  return 'Informational';
}

function summarizeNotam(notam) {
  return String(notam.summary || notam.raw || 'NOTAM text unavailable').replace(/\s+/g, ' ').slice(0, 180);
}

function evaluateSitrep({ metar, minimums, tfrs, notams, traffic }) {
  // Produces one dashboard-level status from multiple feeds. The "level" value
  // is deliberately simple: 0 favorable, 1 review, 2 not recommended.
  if (!metar) {
    return {
      status: 'unknown',
      label: 'Unknown',
      tone: 'text-slate-200',
      summary: 'Insufficient data for an airport SITREP.',
      bullets: ['Weather data unavailable', 'Verify official sources before flight'],
    };
  }

  const bullets = [];
  let level = 0;
  const hazard = severeWeather(metar.raw);
  if (metar.flight_category && metar.flight_category !== 'VFR') {
    level = Math.max(level, 1);
    bullets.push(`${metar.flight_category} reported`);
  }
  if (hazard === 'fail') {
    level = Math.max(level, 2);
    bullets.push('Thunderstorm/heavy weather signal in METAR');
  } else if (hazard === 'caution') {
    level = Math.max(level, 1);
    bullets.push('Precipitation or convective weather reported nearby');
  }
  if (minimums && Number(metar.wind_speed_kt || 0) > Number(minimums.wind_kt || 999)) {
    level = Math.max(level, 1);
    bullets.push('Surface wind exceeds saved personal limit');
  }
  const activeTfr = (tfrs || []).find((tfr) => tfr.active && Number(tfr.distance_nm) <= 25);
  if (activeTfr) {
    level = Math.max(level, 1);
    bullets.push('Nearby active TFR requires review');
  }
  const criticalNotams = (notams || []).filter((notam) => classifyNotam(notam) === 'Critical').length;
  if (criticalNotams) {
    level = Math.max(level, 2);
    bullets.push(`${criticalNotams} critical NOTAM${criticalNotams > 1 ? 's' : ''}`);
  }
  const lowTraffic = (traffic || []).filter((ac) => Number(ac.altitude_ft) > 0 && Number(ac.altitude_ft) <= 3500).length;
  if (lowTraffic) bullets.push(`${lowTraffic} low-altitude aircraft nearby`);

  if (!bullets.length) bullets.push('Winds/weather appear within selected limits', 'No critical alerts found in loaded data');
  if (level === 2) return { status: 'not_recommended', label: 'Not Recommended', tone: 'text-red-300', summary: 'Conditions or alerts are outside selected limits.', bullets };
  if (level === 1) return { status: 'review', label: 'Review', tone: 'text-amber-300', summary: 'Review current conditions and official sources.', bullets };
  return { status: 'favorable', label: 'Favorable', tone: 'text-emerald-300', summary: 'Good conditions for VFR operations based on loaded data.', bullets };
}

function snapshotFrom({ metar, traffic, notams }) {
  // A snapshot is the small set of values we compare across refreshes. Keeping
  // this narrow avoids noisy "what changed" messages when unrelated feed fields
  // churn.
  if (!metar) return null;
  return {
    at: new Date().toISOString(),
    wind_dir_deg: metar.wind_dir_deg ?? null,
    wind_speed_kt: metar.wind_speed_kt ?? null,
    ceiling_ft: metar.ceiling_ft ?? null,
    visibility_sm: metar.visibility_sm ?? null,
    altimeter_inhg: metar.altimeter_inhg ?? null,
    flight_category: metar.flight_category ?? null,
    aircraft_count: traffic?.length ?? null,
    notam_count: notams?.length ?? null,
  };
}

function usePreviousSnapshot(icao, snapshot) {
  const [previous, setPrevious] = useState(null);
  const snapshotKey = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  useEffect(() => {
    if (!snapshot || !icao) return;
    const key = `preflight:sitrep:${icao}`;
    const prior = localStorage.getItem(key);
    try {
      setPrevious(prior ? JSON.parse(prior) : null);
    } catch {
      setPrevious(null);
    }
    localStorage.setItem(key, snapshotKey);
  }, [icao, snapshot, snapshotKey]);

  return previous;
}

function changesFrom(previous, current) {
  // Turns the previous/current local snapshots into human-readable deltas for
  // the "What Changed?" card.
  if (!current) return ['Waiting for a current airport snapshot.'];
  if (!previous) return ['First snapshot for this airport on this device.'];
  const changes = [];
  if (previous.wind_dir_deg != null && current.wind_dir_deg != null) {
    const shift = Math.abs(current.wind_dir_deg - previous.wind_dir_deg);
    if (shift >= 10) changes.push(`Wind shifted ${shift > 180 ? 360 - shift : shift} deg`);
  }
  if (previous.ceiling_ft !== current.ceiling_ft) changes.push(`Ceiling changed from ${previous.ceiling_ft || 'unlimited'} ft to ${current.ceiling_ft || 'unlimited'} ft`);
  if (previous.aircraft_count != null && current.aircraft_count != null && previous.aircraft_count !== current.aircraft_count) changes.push(`${Math.abs(current.aircraft_count - previous.aircraft_count)} ${current.aircraft_count > previous.aircraft_count ? 'new' : 'fewer'} nearby aircraft`);
  if (previous.notam_count != null && current.notam_count != null && previous.notam_count !== current.notam_count) changes.push(`${Math.abs(current.notam_count - previous.notam_count)} ${current.notam_count > previous.notam_count ? 'new' : 'fewer'} NOTAMs`);
  if (previous.altimeter_inhg != null && current.altimeter_inhg != null && previous.altimeter_inhg !== current.altimeter_inhg) changes.push(`Altimeter changed from ${previous.altimeter_inhg} to ${current.altimeter_inhg}`);
  return changes.length ? changes : ['No material change since the last loaded snapshot.'];
}

function Card({ title, icon: Icon, action, children, className = '' }) {
  return (
    <section className={`ops-card ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {Icon ? <Icon size={17} className="text-slate-300" /> : null}
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-200">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Card header actions are external reference links. Styling them as small
// outlined chips (rather than bare text) gives a clear clickable affordance,
// and the trailing icon signals the link opens in a new tab.
function CardActionLink({ href, icon: Icon = ExternalLink, children }) {
  return (
    <a className="card-action" href={href} target="_blank" rel="noreferrer">
      {children}
      {Icon ? <Icon size={12} /> : null}
    </a>
  );
}

function TopBar({ selectedIcao, onSelect }) {
  return (
    <header className="ops-topbar">
      <div className="topbar-brand">
        <div className="brand-mark"><span /></div>
        <div className="brand-word text-xl font-black italic tracking-tight text-white">PREFLIGHT</div>
      </div>
      <div className="topbar-search">
        <AirportSearch selectedIcao={selectedIcao} onSelect={onSelect} />
      </div>
      <div className="ml-auto flex items-center gap-4">
        <button className="ops-icon-button" title="Notifications placeholder" type="button" aria-label="Notifications">
          <Bell size={18} className="text-slate-300" />
        </button>
      </div>
    </header>
  );
}

function AirportSearch({ selectedIcao, onSelect }) {
  const [value, setValue] = useState(selectedIcao);
  useEffect(() => setValue(selectedIcao), [selectedIcao]);

  return (
    <form
      className="airport-search"
      onSubmit={(event) => {
        event.preventDefault();
        onSelect(normalizeAirportCode(value));
      }}
    >
      <Search size={18} />
      <input aria-label="Enter airport code" maxLength={4} onChange={(event) => setValue(event.target.value.toUpperCase())} placeholder="Enter airport code" value={value} />
      <button type="submit">Load</button>
    </form>
  );
}

function SitrepHero({ airport, selectedIcao, sitrep, imageUrl }) {
  const safeImageUrl = String(imageUrl || '').replace(/"/g, '\\"');
  const backgroundImage = imageUrl
    ? `linear-gradient(90deg, rgba(3, 12, 24, 0.88), rgba(3, 12, 24, 0.44), rgba(3, 12, 24, 0.82)), url("${safeImageUrl}")`
    : 'linear-gradient(115deg, rgba(5, 32, 54, 0.98), rgba(3, 12, 24, 0.88)), radial-gradient(circle at 70% 20%, rgba(91, 151, 194, 0.22), transparent 28rem)';
  return (
    <section className="ops-hero sitrep-hero" style={{ backgroundImage }}>
      <div className="relative z-10 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/75">Airport SITREP</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-black leading-none tracking-tight text-white md:text-5xl">{airportName(airport)} · {airport?.icao || selectedIcao}</h1>
        <p className="mt-4 max-w-xl text-base text-white/90">{airportPlace(airport)}</p>
      </div>
      <div className="ops-airport-card sitrep-status-card">
        <div className={`text-3xl font-black tracking-wide ${sitrep.tone}`}>{sitrep.label}</div>
        <p className="mt-2 text-sm text-slate-200">{sitrep.summary}</p>
        <div className="mt-4 space-y-2 text-xs text-slate-300">
          {sitrep.bullets.slice(0, 3).map((item) => (
            <div key={item} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-500" />{item}</div>
          ))}
        </div>
        <p className="mt-4 border-t border-white/10 pt-3 text-[11px] text-slate-400">Supports pilot review. Verify official sources before flight.</p>
      </div>
    </section>
  );
}

function LiveDataStrip({ weatherQuery, trafficQuery, radarQuery, notamsQuery, airportQuery }) {
  // This strip does not fetch anything itself. It only reads React Query state
  // from the parent so the user can see which feeds are fresh, stale, or failed.
  const feeds = [
    ['Weather', feedStatus(weatherQuery, weatherQuery.data?.fetched_utc || weatherQuery.data?.metar?.observed_utc, 15 * 60 * 1000)],
    ['Traffic', feedStatus(trafficQuery, trafficQuery.data?.fetched_utc, 60 * 1000)],
    ['Radar', feedStatus(radarQuery, radarQuery.data?.radar?.time_utc || radarQuery.data?.fetched_utc, 15 * 60 * 1000)],
    ['NOTAMs', feedStatus(notamsQuery, notamsQuery.data?.fetched_utc, 30 * 60 * 1000)],
    ['Airport', feedStatus(airportQuery, airportQuery.data?.fetched_utc, 24 * 60 * 60 * 1000)],
  ];
  const worstTone = feeds.some(([, item]) => item.tone === 'error') ? 'error' : feeds.some(([, item]) => item.tone === 'warning') ? 'warning' : 'live';
  const summary = worstTone === 'error' ? 'Source attention needed' : worstTone === 'warning' ? 'Some feeds aging' : 'Feeds current';
  return (
    <section className={`live-data-strip ${worstTone}`}>
      <div className="live-data-summary">
        <span className="live-data-dot" />
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Live Data</div>
          <div className="text-xs text-slate-300">{summary}</div>
        </div>
      </div>
      <div className="live-data-feeds">
        {feeds.map(([label, status]) => (
          <div key={label} className={`live-data-feed ${status.tone}`}>
            <span>{label}</span>
            <strong>{status.label}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function WeatherRadar({ airport }) {
  const radar = useRadar();
  const lat = Number(airport?.lat || 36.3444);
  const lon = Number(airport?.lon || -94.2211);
  const centerWorld = lonLatToWorld(lat, lon, RADAR_ZOOM);
  const centerTileX = Math.floor(centerWorld.x / TILE_SIZE);
  const centerTileY = Math.floor(centerWorld.y / TILE_SIZE);
  const tiles = [];
  // Build a fixed tile grid around the airport. Each tile is positioned by the
  // pixel offset between its world coordinate and the airport center.
  for (let x = centerTileX - 2; x <= centerTileX + 2; x += 1) {
    for (let y = centerTileY - 2; y <= centerTileY + 2; y += 1) tiles.push({ x, y });
  }
  const radarPath = radar.data?.radar?.path;
  const radarHost = radar.data?.host;

  return (
    <div className="weather-radar mt-5">
      {tiles.map((tile) => {
        const left = tile.x * TILE_SIZE - centerWorld.x;
        const top = tile.y * TILE_SIZE - centerWorld.y;
        const radarUrl = radarHost && radarPath ? `${radarHost}${radarPath}/256/${RADAR_ZOOM}/${tile.x}/${tile.y}/2/1_1.png` : null;
        return (
          <div key={`${tile.x}-${tile.y}`} className="absolute h-64 w-64 max-w-none" style={{ left: `calc(50% + ${left}px)`, top: `calc(50% + ${top}px)` }}>
            <img alt="" className="weather-radar-base absolute inset-0 h-64 w-64 max-w-none select-none" draggable="false" src={`https://tile.openstreetmap.org/${RADAR_ZOOM}/${tile.x}/${tile.y}.png`} />
            {radarUrl ? <img alt="" className="weather-radar-layer absolute inset-0 h-64 w-64 max-w-none select-none" draggable="false" src={radarUrl} /> : null}
          </div>
        );
      })}
      <div className="weather-radar-center"><span className="weather-radar-center-dot" title={airport?.icao || 'Airport'} /></div>
      <div className="weather-radar-caption"><span>Precip radar</span><strong>{radar.data?.radar?.time_utc ? formatLocal(radar.data.radar.time_utc, 'h:mm a') : radar.isLoading ? 'Loading' : 'Unavailable'}</strong></div>
      <a className="weather-radar-source" href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 font-bold text-white">{value}</div>
    </div>
  );
}

function WeatherCard({ airport, weather }) {
  const metar = weather?.metar || {};
  const da = densityAltitude(airport?.elevation_ft, metar.temp_c, metar.altimeter_inhg);
  return (
    <Card title="Weather" icon={Cloud} className="area-weather" action={<CardActionLink href={aviationWeatherUrl(airport)}>Briefing</CardActionLink>}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Cloud size={32} className="text-white" />
          <div className="text-3xl font-black text-white">{metar.temp_c != null ? `${Math.round(metar.temp_c)}C` : '--'}</div>
          <div className="text-sm text-slate-300">{metar.sky_condition || 'Current'}</div>
        </div>
        <div className="text-right text-xs text-slate-400">Observed<br />{formatLocal(metar.observed_utc, 'h:mm a')}</div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm md:grid-cols-3">
        <Metric label="Category" value={metar.flight_category || '--'} />
        <Metric label="Wind" value={`${metar.wind_dir_deg ?? 'VRB'} / ${metar.wind_speed_kt ?? '--'} kt`} />
        <Metric label="Visibility" value={`${metar.visibility_sm ?? '--'} sm`} />
        <Metric label="Ceiling" value={metar.ceiling_ft ? `${metar.ceiling_ft.toLocaleString()} ft` : 'Unlimited'} />
        <Metric label="Dew Point" value={`${metar.dewpoint_c ?? '--'}C`} />
        <Metric label="Altimeter" value={`${metar.altimeter_inhg ?? '--'} inHg`} />
        <Metric label="Density Alt." value={da == null ? '--' : `${da.toLocaleString()} ft`} />
      </div>
      {metar.raw && (metar.temp_c == null || metar.dewpoint_c == null) ? (
        <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-500/10 p-2 text-[11px] text-amber-100">
          This station isn&apos;t reporting temperature/dew point right now, so dew point and density altitude show as --.
        </div>
      ) : null}
      <div className="mt-4 rounded-md bg-slate-950/60 p-3 font-mono text-xs leading-relaxed text-slate-300">{metar.raw || 'METAR unavailable.'}</div>
      <WeatherRadar airport={airport} />
    </Card>
  );
}

function RunwayWindCard({ airport, weather }) {
  const metar = weather?.metar || {};
  // Data flow: airport.runways + weather.metar -> ranked runway ends -> main
  // visual for the best runway plus a comparison table for the alternatives.
  const runwayOptions = runwayWindOptions(airport, metar);
  const best = runwayOptions[0] || null;
  const tailwind = best?.headwind < 0 ? Math.abs(best.headwind) : 0;
  const headwind = best?.headwind > 0 ? best.headwind : 0;
  const windDisplay = metar.wind_dir_deg == null ? 'VRB' : `${metar.wind_dir_deg} deg`;
  const gustDisplay = metar.wind_gust_kt ? `G${metar.wind_gust_kt}` : 'No gust';
  return (
    <Card title="Runway / Wind" icon={Wind} className="area-runway" action={<CardActionLink href={skyVectorUrl(airport)}>Chart</CardActionLink>}>
      <div className="runway-visual">
        <div className="wind-arrow" style={{ transform: `rotate(${(metar.wind_dir_deg || 0) + 180}deg)` }} />
        <div className="runway-bar">
          <span className="runway-end top">{best?.id || '--'}</span>
          <span className="runway-centerline" />
          <span className="runway-end bottom">{best?.runway?.id?.split('/')?.find((id) => id !== best?.id) || '--'}</span>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <Metric label="Best headwind" value={best ? `RWY ${best.id}` : '--'} />
        <Metric label="Wind" value={`${windDisplay} / ${metar.wind_speed_kt ?? '--'} kt`} />
        <Metric label="Headwind" value={`${headwind} kt`} />
        <Metric label="Tailwind" value={`${tailwind} kt`} />
        <Metric label="Crosswind" value={`${best?.crosswind ?? '--'} kt`} />
        <Metric label="Gust" value={gustDisplay} />
      </div>
      <div className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
        <div className="flex items-center justify-between gap-3"><span>Runway length</span><strong className="text-white">{best?.runway?.length_ft ? `${best.runway.length_ft.toLocaleString()} ft` : '--'}</strong></div>
        <div className="mt-2 flex items-center justify-between gap-3"><span>Surface</span><strong className="text-white">{best?.runway?.surface || 'Verify chart'}</strong></div>
      </div>
      {runwayOptions.length > 1 ? (
        <div className="runway-options mt-4">
          <div className="runway-options-head">
            <span>Runway</span>
            <span>H/T</span>
            <span>Xwind</span>
          </div>
          <div className="runway-options-list">
            {runwayOptions.map((option) => {
              const isBest = option.id === best?.id && option.runway?.id === best?.runway?.id;
              const component = option.headwind >= 0 ? `H ${option.headwind}` : `T ${Math.abs(option.headwind)}`;
              return (
                <div key={`${option.runway?.id}-${option.id}`} className={`runway-option-row ${isBest ? 'active' : ''}`}>
                  <strong>RWY {option.id}</strong>
                  <span>{component} kt</span>
                  <span>{option.crosswind} kt</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function FuelIndex({ average, averageLabel = 'AirNav national avg', deltaPct, status, positionPct }) {
  const comparisonText = status ? `${signedPct(deltaPct)} ${status}` : 'No comparison';
  return (
    <div className="fuel-index-row">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-400">{averageLabel} {money(average)}</span>
        <strong className={deltaPct <= -5 ? 'text-emerald-300' : deltaPct >= 5 ? 'text-red-300' : 'text-slate-300'}>{comparisonText}</strong>
      </div>
      <div className="fuel-index flex-1"><span className="fuel-index-mid" /><span className="fuel-index-dot" style={{ left: `${positionPct ?? 50}%` }} /></div>
    </div>
  );
}

function FuelCard({ fuel }) {
  // The useFuel hook is owned by App so the same query object can also feed the
  // source freshness card. This component only renders the local/market payload.
  const local = fuel.data?.local;
  const fuels = local?.fuels || [];
  const sourceUrl = local?.source_url || fuel.data?.sources?.[0]?.url;
  const emptyMessage = fuel.isLoading
    ? 'Loading fuel prices...'
    : fuel.isError
      ? 'Fuel source unavailable.'
      : local?.status_message || 'Fuel prices unavailable.';
  const updatedLabel = local?.updated
    ? `Updated ${local.updated}`
    : local?.status === 'no_fuel'
      ? 'No fuel listed'
      : 'Price update unavailable';
  return (
    <Card title="Fuel Prices" icon={Fuel} className="area-fuel">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {fuels.length ? fuels.map((item) => (
          <div key={item.id || `${item.code}-${item.service}-${item.fbo}`} className="fuel-price-row">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-white">{item.label}</div>
                <div className="text-xs text-slate-400">{[item.fbo, item.service].filter(Boolean).join(' - ')}</div>
                <div className="mt-1 text-[11px] text-slate-500">{item.updated ? `Updated ${item.updated}` : item.guaranteed ? 'Guaranteed on AirNav' : 'Update date unavailable'}</div>
              </div>
              <div className="text-right"><div className="text-2xl font-black text-white">{money(item.price_per_gal)}</div><div className="text-xs text-slate-400">per gal</div></div>
            </div>
            <div className="mt-4"><FuelIndex average={item.market_avg ?? item.regional_avg} averageLabel={item.market_reference_label} deltaPct={item.market_delta_pct} status={item.market_status} positionPct={item.index_position_pct} /></div>
          </div>
        )) : <div className="rounded-md border border-white/10 bg-white/5 p-4 text-sm text-slate-300">{emptyMessage}</div>}
      </div>
      <div className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{updatedLabel}</span>
          {sourceUrl ? <a className="font-bold text-orange-400 hover:text-orange-300" href={sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
        </div>
        {fuel.data?.warnings?.[0] ? <div className="mt-2 text-[11px] text-amber-200">{fuel.data.warnings[0]}</div> : null}
      </div>
    </Card>
  );
}

function NotamCard({ notams, airport, warning }) {
  // Grouping happens client-side because the source function keeps NOTAM text
  // normalized but intentionally avoids judging operational severity.
  const groups = ['Critical', 'Operational', 'Navigation', 'Informational'].map((label) => ({
    label,
    items: (notams || []).filter((notam) => classifyNotam(notam) === label),
  }));
  return (
    <Card title="NOTAM Triage" icon={AlertTriangle} className="area-notams" action={<CardActionLink href={faaNotamSearchUrl(airport)}>FAA Search</CardActionLink>}>
      {warning ? <div className="mb-4 rounded-md border border-amber-300/20 bg-amber-500/10 p-3 text-xs text-amber-100">{warning}</div> : null}
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-slate-400"><span>{group.label}</span><span>{group.items.length}</span></div>
            <div className="space-y-2">
              {group.items.slice(0, 3).map((notam) => (
                <details key={notam.id} className="notam-item">
                  <summary><span className={`notam-badge ${group.label.toLowerCase()}`}>{group.label}</span>{summarizeNotam(notam)}</summary>
                  <div className="mt-2 rounded bg-slate-950/60 p-3 font-mono text-[11px] text-slate-300">{notam.raw || notam.summary}</div>
                </details>
              ))}
              {!group.items.length ? <div className="text-xs text-slate-500">No loaded {group.label.toLowerCase()} NOTAMs.</div> : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AirportOverviewCard({ airport }) {
  const frequencies = airportFrequencies(airport);
  return (
    <Card
      title="Airport Overview"
      icon={MapPin}
      className="area-overview"
      action={<CardActionLink href={liveAtcUrl(airport)} icon={Headphones}>LiveATC</CardActionLink>}
    >
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Metric label="Identifier" value={airport?.icao || '--'} />
        <Metric label="Elevation" value={airport?.elevation_ft ? `${airport.elevation_ft.toLocaleString()} ft MSL` : '--'} />
        <Metric label="Runways" value={airport?.runways?.map((rwy) => rwy.id).join(', ') || '--'} />
        <Metric label="Tower" value={airport?.towered ? 'Towered' : 'Non-towered / verify'} />
        <Metric label="Services" value={airport?.services || '--'} />
        <Metric label="Beacon" value={airport?.beacon || '--'} />
      </div>
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Frequencies</div>
        <div className="flex flex-wrap gap-2">{frequencies.length ? frequencies.map((freq) => (
          <span key={`${freq.label}-${freq.value}`} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">
            <strong className="mr-1 text-slate-100">{freq.label}</strong>{freq.value}
          </span>
        )) : <span className="text-xs text-slate-500">No frequencies loaded.</span>}</div>
        {airport?.frequency_source ? <div className="mt-2 text-[11px] text-slate-500">Source fallback: {airport.frequency_source}</div> : null}
      </div>
    </Card>
  );
}

function AlternatesCard({ alternates, onSelect }) {
  return (
    <Card title="Nearby Alternates" icon={Compass} className="area-alternates">
      <div className="space-y-2">
        {(alternates || []).slice(0, 6).map((alternate) => (
          <button key={alternate.icao} className="alternate-row w-full text-left" onClick={() => onSelect(alternate.icao)} type="button">
            <div><div className="font-bold text-white">{alternate.icao}</div><div className="text-xs text-slate-400">{alternate.name}</div></div>
            <div className="text-right text-xs text-slate-300"><strong className="text-white">{alternate.distance_nm} NM</strong><br />{cardinal(alternate.bearing_deg)} - {alternate.flight_category || '--'}</div>
          </button>
        ))}
        {!alternates?.length ? <div className="text-sm text-slate-400">No nearby METAR alternates loaded.</div> : null}
      </div>
    </Card>
  );
}

function ChangesCard({ changes, previousSnapshot, currentSnapshot }) {
  const reference = previousSnapshot?.at
    ? `Since ${formatLocal(previousSnapshot.at, 'MMM d, h:mm a zzz')}`
    : currentSnapshot?.at
      ? `Snapshot started ${formatLocal(currentSnapshot.at, 'h:mm a zzz')}`
      : 'Waiting for current snapshot';
  return (
    <Card title="What Changed?" icon={Gauge} className="area-changes" action={<span className="text-xs font-semibold text-slate-400">{reference}</span>}>
      <div className="space-y-3">
        {changes.map((change) => (
          <div key={change} className="flex gap-3 rounded-md bg-white/5 p-3 text-sm text-slate-300"><span className="mt-1 h-2 w-2 rounded-full bg-orange-500" />{change}</div>
        ))}
      </div>
      {currentSnapshot?.at ? <div className="mt-4 text-xs text-slate-500">Current snapshot: {formatLocal(currentSnapshot.at, 'MMM d, h:mm:ss a zzz')}</div> : null}
    </Card>
  );
}

function SourceFreshnessCard({ airportQuery, weatherQuery, notamsQuery, trafficQuery, fuelQuery, radarQuery }) {
  // One place to compare feed age across all hooks. The stale thresholds live
  // in feedStatus; this card uses the fetch timestamps as display data.
  const rows = [
    ['Weather/METAR', weatherQuery.data?.fetched_utc, 'NOAA/AviationWeather'],
    ['NOTAMs', notamsQuery.data?.fetched_utc, 'FAA'],
    ['Airport Data', airportQuery.data?.fetched_utc, 'AviationWeather/FAA'],
    ['Traffic/ADS-B', trafficQuery.data?.fetched_utc, 'adsb.fi'],
    ['Fuel Prices', fuelQuery.data?.fetched_utc, 'AirNav'],
    ['Radar', radarQuery.data?.radar?.time_utc || radarQuery.data?.fetched_utc, 'RainViewer'],
  ];
  return (
    <Card title="Data Freshness" icon={Database} className="area-sources">
      <div className="space-y-2">
        {rows.map(([label, updated, source]) => (
          <div key={label} className="source-row"><span>{label}</span><strong>{timeAgo(updated)}</strong><small>{source}</small></div>
        ))}
      </div>
    </Card>
  );
}

function BottomStrip() {
  return (
    <footer className="ops-bottom-strip">
      <span>&copy; {new Date().getFullYear()} Preflight. For situational awareness only.</span>
      <span>Always verify with official sources before flight.</span>
    </footer>
  );
}

export default function App() {
  // Top-level data flow:
  // selected ICAO -> data hooks -> normalized payloads -> focused dashboard cards.
  // React Query owns request caching/refetching; App only coordinates the results.
  // No airport is pre-populated. A returning visitor resumes their last airport
  // from localStorage; a deployment may still pin a default via VITE_AIRPORT_ICAO;
  // otherwise we start empty and prompt the user to search.
  const [selectedIcao, setSelectedIcao] = useState(() => {
    const stored = localStorage.getItem('preflight:selectedAirport');
    if (stored) return stored;
    const envDefault = import.meta.env.VITE_AIRPORT_ICAO;
    return envDefault ? normalizeAirportCode(envDefault) : '';
  });
  const [recents, setRecents] = useState(getRecentAirports);
  const airportQuery = useAirport(selectedIcao);
  const airport = airportQuery.data?.airport;
  const airportImageQuery = useAirportImage(airport || { icao: selectedIcao });
  const heroImageUrl = airportImageQuery.data?.image_url || (selectedIcao === 'KVBT' ? HERO_IMAGE : null);
  const weatherQuery = useWeather(selectedIcao);
  const notamsQuery = useNotams(selectedIcao);
  const tfrQuery = useTfr(selectedIcao);
  const fuelQuery = useFuel(selectedIcao);
  const radarQuery = useRadar();
  const center = airport ? { icao: airport.icao, lat: airport.lat, lon: airport.lon } : null;
  const trafficQuery = useTraffic(25, center);
  const minimums = useBlob('config', 'personal_minimums');

  useEffect(() => {
    // Persist the selection so returning visitors resume it, and clear it when
    // empty so they land back on the search prompt instead of a stale airport.
    if (selectedIcao) localStorage.setItem('preflight:selectedAirport', selectedIcao);
    else localStorage.removeItem('preflight:selectedAirport');
  }, [selectedIcao]);

  useEffect(() => {
    // Record airports only once they successfully resolve, using the canonical
    // ICAO from the airport payload so recents stay clean and de-duplicated.
    if (airport?.icao) setRecents(addRecentAirport(airport.icao));
  }, [airport?.icao]);

  const sitrep = useMemo(() => evaluateSitrep({
    metar: weatherQuery.data?.metar,
    minimums: minimums.data,
    tfrs: tfrQuery.data?.tfrs_nearby || [],
    notams: notamsQuery.data?.notams || [],
    traffic: trafficQuery.data?.aircraft || [],
  }), [weatherQuery.data, minimums.data, tfrQuery.data, notamsQuery.data, trafficQuery.data]);

  const snapshot = useMemo(() => snapshotFrom({
    metar: weatherQuery.data?.metar,
    traffic: trafficQuery.data?.aircraft,
    notams: notamsQuery.data?.notams,
  }), [weatherQuery.data, trafficQuery.data, notamsQuery.data]);
  const previousSnapshot = usePreviousSnapshot(selectedIcao, snapshot);
  const changes = changesFrom(previousSnapshot, snapshot);

  if (!selectedIcao) {
    return <AirportPrompt onSelect={setSelectedIcao} recents={recents} />;
  }

  return (
    <div className="legends-dashboard min-h-screen">
      <div className="min-w-0 flex-1">
        <TopBar selectedIcao={selectedIcao} onSelect={setSelectedIcao} />
        <main className="px-5 py-5 xl:px-8">
          <SitrepHero airport={airport} selectedIcao={selectedIcao} sitrep={sitrep} imageUrl={heroImageUrl} />
          <LiveDataStrip weatherQuery={weatherQuery} trafficQuery={trafficQuery} radarQuery={radarQuery} notamsQuery={notamsQuery} airportQuery={airportQuery} />
          {airportQuery.isError ? <div className="mt-4 rounded-md border border-red-300/30 bg-red-950/30 p-4 text-sm text-red-100">{airportQuery.error.message}</div> : null}
          <div className="ops-layout sitrep-layout mt-5">
            <WeatherCard airport={airport} weather={weatherQuery.data} />
            <RunwayWindCard airport={airport} weather={weatherQuery.data} />
            <FuelCard fuel={fuelQuery} />
            <TrafficScope airport={airport} className="area-traffic" />
            <NotamCard notams={notamsQuery.data?.notams || []} airport={airport} warning={notamsQuery.data?.warning} />
            <AirportOverviewCard airport={airport} />
            <AlternatesCard alternates={airportQuery.data?.alternates || []} onSelect={setSelectedIcao} />
            <ChangesCard changes={changes} previousSnapshot={previousSnapshot} currentSnapshot={snapshot} />
            <SourceFreshnessCard airportQuery={airportQuery} weatherQuery={weatherQuery} notamsQuery={notamsQuery} trafficQuery={trafficQuery} fuelQuery={fuelQuery} radarQuery={radarQuery} />
          </div>
        </main>
        <BottomStrip />
      </div>
    </div>
  );
}
