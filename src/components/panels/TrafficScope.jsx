import { Navigation, RadioTower, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTraffic } from '../../hooks/useTraffic';
import { formatLocal, isOlderThan } from '../../lib/time';
import { Badge } from '../ui/Badge';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';
import { StaleIndicator } from '../ui/StaleIndicator';

const LOW_ALT_FT = 3500;
const TILE_SIZE = 256;
const METERS_PER_NM = 1852;
const RANGE_OPTIONS = [5, 10, 25];

function zoomForRadius(radiusNm) {
  if (radiusNm <= 5) return 12;
  if (radiusNm <= 10) return 11;
  return 10;
}

function lonLatToWorld(lat, lon, zoom) {
  // Same Web Mercator math used by map tiles. The scope positions everything as
  // pixel offsets from the selected airport's world coordinate.
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function pointFor(ac, centerWorld, zoom) {
  // Aircraft lat/lon -> screen offset from center. CSS later anchors that offset
  // at 50%/50% of the scope.
  const world = lonLatToWorld(ac.lat, ac.lon, zoom);
  return {
    x: world.x - centerWorld.x,
    y: world.y - centerWorld.y,
  };
}

function rangePixels(rangeNm, centerLat, zoom) {
  // Converts nautical-mile range rings into CSS pixels at the current latitude.
  return (rangeNm * METERS_PER_NM) / metersPerPixel(centerLat, zoom);
}

function runwayPixels(airport, zoom) {
  const runway = airport?.runways?.[0];
  const lengthFt = Number(runway?.length_ft || 3000);
  return Math.max(12, (lengthFt * 0.3048) / metersPerPixel(airport.lat, zoom));
}

function runwayLabel(airport) {
  return airport?.runways?.[0]?.id ? `RWY ${airport.runways[0].id}` : 'Runway';
}

function aircraftProfileUrl(ac) {
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(ac.registration || ac.callsign || ac.hex)}`;
}

function altitudeLabel(value) {
  if (value == null || Number.isNaN(Number(value))) return 'ALT --';
  if (value === 0) return 'GROUND';
  return `${Math.round(value / 100)}`;
}

function bearingLabel(value) {
  if (value == null) return '--';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(Number(value) / 45) % 8];
}

function trend(rate) {
  if (rate == null) return 'level';
  if (Number(rate) > 200) return 'climb';
  if (Number(rate) < -200) return 'desc';
  return 'level';
}

function MapTiles({ center, centerWorld, zoom }) {
  const centerTileX = Math.floor(centerWorld.x / TILE_SIZE);
  const centerTileY = Math.floor(centerWorld.y / TILE_SIZE);
  const tiles = [];
  // Render a small fixed grid around the center tile instead of using a full map
  // SDK. This keeps the radar scope lightweight and predictable.
  for (let x = centerTileX - 3; x <= centerTileX + 3; x += 1) {
    for (let y = centerTileY - 2; y <= centerTileY + 2; y += 1) {
      tiles.push({ x, y });
    }
  }

  return (
    <div className="absolute inset-0 z-0">
      {tiles.map((tile) => {
        const left = tile.x * TILE_SIZE - centerWorld.x;
        const top = tile.y * TILE_SIZE - centerWorld.y;
        return (
          <img
            key={`${tile.x}-${tile.y}`}
            alt=""
            className="traffic-map-tile absolute h-64 w-64 max-w-none select-none"
            draggable="false"
            src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
            style={{
              left: `calc(50% + ${left}px)`,
              top: `calc(50% + ${top}px)`,
            }}
          />
        );
      })}
      <span className="sr-only">Map centered on {center.icao}</span>
    </div>
  );
}

function ScopeShell({ title, className, action, children }) {
  return (
    <section className={`ops-card ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RadioTower size={17} className="text-slate-300" />
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-200">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TrafficScope({ airport, title = 'Flight Radar / ADS-B', className = '' }) {
  // Data flow: selected airport -> useTraffic(radius, center) -> normalized
  // aircraft list -> map markers, range rings, and side table.
  const [radius, setRadius] = useState(10);
  const [highlighted, setHighlighted] = useState(null);
  const center = {
    icao: airport?.icao || 'KVBT',
    lat: Number(airport?.lat || 36.3444),
    lon: Number(airport?.lon || -94.2211),
  };
  const zoom = zoomForRadius(radius);
  const centerWorld = lonLatToWorld(center.lat, center.lon, zoom);
  const traffic = useTraffic(radius, center);

  if (traffic.isLoading) return <ScopeShell title={title} className={className}><LoadingState lines={5} /></ScopeShell>;
  if (traffic.isError) return <ScopeShell title={title} className={className}><ErrorState title="Could not reach ADS-B traffic feed" error={traffic.error} onRetry={traffic.refetch} /></ScopeShell>;

  const aircraft = traffic.data.aircraft || [];
  // The function sorts by distance, so aircraft[0] is the closest target.
  const closest = aircraft[0];
  const lowPattern = aircraft.filter((ac) => Number(ac.altitude_ft) > 0 && Number(ac.altitude_ft) <= LOW_ALT_FT).length;
  const stale = isOlderThan(traffic.data.fetched_utc, 45 * 1000);
  const rings = radius === 5 ? [1, 2.5, 5] : radius === 10 ? [2.5, 5, 10] : [5, 10, 25];

  return (
    <ScopeShell
      title={title}
      className={className}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="radar-range-control">
            {RANGE_OPTIONS.map((option) => (
              <button key={option} className={option === radius ? 'active' : ''} onClick={() => setRadius(option)} type="button">{option} NM</button>
            ))}
          </div>
          {traffic.isFetching ? <RefreshCw className="animate-spin text-cyan-200" size={16} /> : null}
          {stale ? <StaleIndicator timestamp={traffic.data.fetched_utc} /> : <Badge tone="blue">ADS-B live</Badge>}
        </div>
      }
    >
      <div className="grid flex-1 gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="traffic-scope relative min-h-[420px] overflow-hidden rounded-lg border border-cyan-300/20 bg-slate-950/80">
          <MapTiles center={center} centerWorld={centerWorld} zoom={zoom} />
          <div className="absolute inset-0 z-[1] bg-slate-950/25" />
          <div className="absolute bottom-2 left-2 z-40 rounded border border-cyan-300/25 bg-slate-950/80 px-2.5 py-1.5 text-xs shadow-[0_0_18px_rgba(103,232,249,0.14)]">
            <div className="font-bold uppercase tracking-[0.2em] text-cyan-50">{center.icao}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-cyan-300/70">{runwayLabel(airport)}</div>
          </div>
          <div className="absolute bottom-2 right-2 z-40 rounded border border-cyan-300/20 bg-slate-950/75 px-2 py-1 text-[10px] text-cyan-100/70">
            &copy; <a className="underline decoration-cyan-300/40 underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
          </div>
          <div className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <div className="traffic-runway-icon" style={{ height: `${runwayPixels(airport || center, zoom)}px` }} title="Runway scaled to map zoom" />
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-50 drop-shadow-[0_0_8px_rgba(6,182,212,0.85)]">{center.icao}</div>
          </div>
          {rings.map((range) => (
            <div
              key={range}
              className="absolute left-1/2 top-1/2 z-10 rounded-full border border-cyan-300/20"
              style={{
                width: `${rangePixels(range, center.lat, zoom) * 2}px`,
                aspectRatio: '1',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className="absolute right-2 top-1 text-[9px] font-semibold text-cyan-200/60">{range} NM</span>
            </div>
          ))}
          <div className="absolute left-1/2 top-4 z-10 h-[calc(100%-2rem)] w-px -translate-x-1/2 bg-cyan-300/15" />
          <div className="absolute left-4 top-1/2 z-10 h-px w-[calc(100%-2rem)] -translate-y-1/2 bg-cyan-300/15" />
          {aircraft.slice(0, 36).map((ac) => {
            const point = pointFor(ac, centerWorld, zoom);
            const state = trend(ac.vertical_rate_fpm);
            const id = ac.hex || ac.callsign;
            const active = highlighted === id;
            const tone = ac.emergency && ac.emergency !== 'none' ? 'text-red-200' : state === 'climb' ? 'text-emerald-200' : state === 'desc' ? 'text-amber-200' : 'text-cyan-100';
            return (
              <a
                key={id}
                className={`absolute z-30 -translate-x-1/2 -translate-y-1/2 ${tone} ${active ? 'traffic-marker-active' : ''}`}
                href={aircraftProfileUrl(ac)}
                onMouseEnter={() => setHighlighted(id)}
                onMouseLeave={() => setHighlighted(null)}
                rel="noreferrer"
                style={{ left: `calc(50% + ${point.x}px)`, top: `calc(50% + ${point.y}px)` }}
                target="_blank"
                title={`${ac.callsign} ${ac.type || ''}`}
              >
                <Navigation
                  size={18}
                  className="drop-shadow-[0_0_8px_rgba(103,232,249,0.8)]"
                  style={{ transform: `rotate(${(ac.track_deg || 0) - 45}deg)` }}
                />
                <div className="pointer-events-none absolute left-4 top-2 min-w-20 whitespace-nowrap rounded border border-cyan-300/20 bg-slate-950/90 px-1.5 py-0.5 font-mono text-[10px] leading-tight shadow-[0_0_12px_rgba(0,0,0,0.35)]">
                  <div>{ac.callsign}</div>
                  <div className="text-cyan-200/65">{altitudeLabel(ac.altitude_ft)} - {ac.ground_speed_kt ?? '--'}KT</div>
                </div>
              </a>
            );
          })}
          {!aircraft.length ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-cyan-100/65">No ADS-B aircraft within {radius} NM.</div>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-cyan-300/15 bg-cyan-300/5 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">Aircraft</div>
              <div className="mt-1 text-2xl font-semibold text-cyan-50">{aircraft.length}</div>
            </div>
            <div className="rounded-md border border-cyan-300/15 bg-cyan-300/5 p-3">
              <div className="whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.1em] text-cyan-200/70 sm:text-[9px]">Low Alt &lt;= {LOW_ALT_FT.toLocaleString()} FT</div>
              <div className="mt-1 text-2xl font-semibold text-amber-100">{lowPattern}</div>
            </div>
            <div className="rounded-md border border-cyan-300/15 bg-cyan-300/5 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">Closest</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-100">{closest?.distance_nm != null ? `${closest.distance_nm} NM` : '--'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-cyan-100/70">
            <RadioTower size={14} />
            <span>Updated {formatLocal(traffic.data.fetched_utc, 'h:mm:ss a')} - ADS-B positions may be delayed or incomplete.</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto rounded-md border border-cyan-300/15">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-950/95 text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Alt</th>
                  <th className="px-3 py-2">Range</th>
                  <th className="px-3 py-2">Bearing</th>
                  <th className="px-3 py-2">GS</th>
                </tr>
              </thead>
              <tbody>
                {aircraft.slice(0, 14).map((ac) => {
                  const id = ac.hex || ac.callsign;
                  return (
                    <tr
                      key={id}
                      className={`border-t border-cyan-300/10 ${highlighted === id ? 'bg-cyan-300/10' : ''}`}
                      onMouseEnter={() => setHighlighted(id)}
                      onMouseLeave={() => setHighlighted(null)}
                    >
                      <td className="px-3 py-2 font-mono font-semibold">
                        <a className="text-cyan-50 underline decoration-cyan-300/35 underline-offset-4 hover:text-cyan-200" href={aircraftProfileUrl(ac)} target="_blank" rel="noreferrer">
                          {ac.callsign}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-cyan-100/75">{ac.type || '--'}</td>
                      <td className="px-3 py-2 text-cyan-100/75">{ac.altitude_ft?.toLocaleString?.() ?? '--'}</td>
                      <td className="px-3 py-2 text-cyan-100/75">{ac.distance_nm ?? '--'} NM</td>
                      <td className="px-3 py-2 text-cyan-100/75">{bearingLabel(ac.bearing_deg)} {ac.bearing_deg ?? '--'} deg</td>
                      <td className="px-3 py-2 text-cyan-100/75">{ac.ground_speed_kt ?? '--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ScopeShell>
  );
}
