import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  Download,
  FileText,
  Fuel,
  Gauge,
  Headphones,
  Home,
  MapPin,
  Plane,
  RadioTower,
  Settings,
  Sun,
  Trophy,
  Wallet,
  Wind,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { ExpenseEntryForm } from './components/forms/ExpenseEntryForm';
import { LogbookEntryForm } from './components/forms/LogbookEntryForm';
import { Modal } from './components/forms/Modal';
import { NextLessonForm } from './components/forms/NextLessonForm';
import { PracticeTestForm } from './components/forms/PracticeTestForm';
import { useBlob } from './hooks/useBlobs';
import { useFuel } from './hooks/useFuel';
import { useLesson } from './hooks/useLesson';
import { useRadar } from './hooks/useRadar';
import { useTfr } from './hooks/useTfr';
import { useWeather } from './hooks/useWeather';
import { aggregateHours, computeReadiness, projectedTotalCost } from './lib/checkride';
import { AIRPORT, FLEET, PRIMARY_AIRCRAFT, labelize } from './lib/constants';
import { densityAltitude } from './lib/densityAlt';
import { evaluateGoNoGo } from './lib/goNoGo';
import { formatLocal, todayLocalISO } from './lib/time';
import { apiFetch } from './lib/api';
import { TrafficScope } from './components/panels/TrafficScope';

const HERO_IMAGE = 'https://images.squarespace-cdn.com/content/v1/67f3ee1006d37e724190ac27/2eac87a2-5c81-4d45-a6ea-e56aca8203ad/Thaden-Exteriors-HR-007.jpg';
const ATC_AUDIO_URL = 'https://www.liveatc.net/search/?icao=kvbt';
const AIRPORT_DIAGRAM_URL = 'https://skyvector.com/airport/VBT/Bentonville-Municipal-Louise-M-Thaden-Field-Airport';
const PPL_ACS_URL = 'https://www.faa.gov/training_testing/testing/acs/private_airplane_acs_6.pdf';
const RADAR_ZOOM = 7;
const TILE_SIZE = 256;

function money(value) {
  return value == null ? '--' : `$${Number(value).toFixed(2)}`;
}

function signedPct(value) {
  if (value == null) return '--';
  const rounded = Math.abs(Number(value)).toFixed(1);
  return `${Number(value) > 0 ? '+' : Number(value) < 0 ? '-' : ''}${rounded}%`;
}

function flightAwareAircraftUrl(tail) {
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(tail)}`;
}

function lonLatToWorld(lat, lon, zoom = RADAR_ZOOM) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
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

function Sidebar() {
  const items = [
    [Home, 'Dashboard'],
    [Plane, 'Flights'],
    [BookOpen, 'Logbook'],
    [FileText, 'Ground School'],
    [ClipboardCheck, 'Checkrides'],
    [Wrench, 'Aircraft'],
    [Wallet, 'Expenses'],
    [Settings, 'Settings'],
  ];
  return (
    <aside className="ops-sidebar">
      <div className="flex items-center gap-3 px-4 pt-6">
        <div className="brand-mark"><span /></div>
        <div className="text-2xl font-black italic tracking-tight text-white">PREFLIGHT</div>
      </div>
      <nav className="mt-8 space-y-2 px-4">
        {items.map(([Icon, label], index) => (
          <a key={label} className={`ops-nav-item ${index === 0 ? 'active' : ''}`} href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}>
            <Icon size={16} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="mt-auto border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-500 text-sm font-bold text-white">MG</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">Matt Guenther</div>
            <div className="text-xs text-slate-400">Student Pilot</div>
          </div>
          <ChevronDown size={15} className="ml-auto text-slate-500" />
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const weather = useWeather();
  async function downloadBackup() {
    const data = await apiFetch('/.netlify/functions/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `preflight-backup-${todayLocalISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <header className="ops-topbar">
      <div className="flex min-w-0 items-center gap-3">
        <MapPin size={20} className="text-slate-300" />
        <div className="truncate text-sm font-bold text-white">{AIRPORT.icao} / {AIRPORT.name} / {AIRPORT.city}</div>
        <ChevronDown size={16} className="text-slate-500" />
      </div>
      <div className="hidden items-center gap-2 md:flex">
        <span className="live-ops-indicator inline-flex items-center gap-1 rounded-md border border-emerald-400/35 bg-emerald-400/12 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
          <RadioTower size={13} /> Live Ops
        </span>
        <span className="rounded-md border border-sky-400/25 bg-sky-400/12 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-sky-200">Student VFR</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <a className="hidden items-center gap-2 text-sm font-semibold text-white hover:text-orange-400 lg:flex" href={ATC_AUDIO_URL} target="_blank" rel="noreferrer">
          <Headphones size={17} className="text-slate-300" />
          Bentonville Tower <span className="text-slate-400">119.975</span>
        </a>
        <div className="hidden items-center gap-2 text-sm font-semibold text-white sm:flex">
          <Sun size={17} className="text-slate-300" />
          {weather.data?.metar?.temp_c != null ? `${Math.round((weather.data.metar.temp_c * 9) / 5 + 32)}F` : '--'}
        </div>
        <Bell size={18} className="hidden text-slate-300 sm:block" />
        <button className="ops-outline-button" onClick={downloadBackup}>
          <Download size={15} /> Download Backup
        </button>
      </div>
    </header>
  );
}

function Hero() {
  const weather = useWeather();
  const tfr = useTfr();
  const minimums = useBlob('config', 'personal_minimums');
  const result = evaluateGoNoGo(weather.data?.metar, minimums.data, tfr.data?.tfrs_nearby || [], weather.data?.taf);
  const headline = result.status === 'go' ? "You're cleared for takeoff." : result.status === 'caution' ? 'Review before takeoff.' : 'Hold short for now.';
  const subtext = result.status === 'go' ? 'Conditions look good for training at KVBT. Fly safe and have a great flight.' : 'Check weather, airspace, and personal minimums before committing.';

  return (
    <section className="ops-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(3, 12, 24, 0.86), rgba(3, 12, 24, 0.38), rgba(3, 12, 24, 0.82)), url(${HERO_IMAGE})` }}>
      <div className="relative z-10 max-w-2xl">
        <p className="text-sm font-semibold text-white/85">Good afternoon, Matt.</p>
        <h1 className="mt-2 max-w-xl text-4xl font-black leading-none tracking-tight text-white md:text-5xl">{headline}</h1>
        <p className="mt-4 max-w-xl text-base text-white/90">{subtext}</p>
      </div>
      <div className="ops-airport-card">
        <div className="flex items-start gap-3">
          <RadioTower size={26} className="text-sky-200" />
          <div>
            <div className="font-bold text-white">KVBT - Thaden Field</div>
            <div className="text-sm text-slate-300">Bentonville, AR</div>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-6"><span>Elevation</span><strong>{AIRPORT.elevation_ft.toLocaleString()} ft MSL</strong></div>
          <a className="flex justify-between gap-6 hover:text-orange-400" href={AIRPORT_DIAGRAM_URL} target="_blank" rel="noreferrer"><span>Runway</span><strong>18 / 36 - 6,006 ft</strong></a>
          <a className="flex justify-between gap-6 hover:text-orange-400" href={ATC_AUDIO_URL} target="_blank" rel="noreferrer"><span>Tower</span><strong>119.975</strong></a>
        </div>
      </div>
    </section>
  );
}

function FlightReadinessCard() {
  const weather = useWeather();
  const tfr = useTfr();
  const minimums = useBlob('config', 'personal_minimums');
  const result = evaluateGoNoGo(weather.data?.metar, minimums.data, tfr.data?.tfrs_nearby || [], weather.data?.taf);
  const status = result.status === 'go' ? 'GO' : result.status === 'caution' ? 'CAUTION' : 'NO-GO';
  return (
    <Card title="Today's Flight Readiness" icon={Plane} className="area-readiness">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className={`text-2xl font-black tracking-wide ${result.status === 'go' ? 'text-emerald-400' : result.status === 'caution' ? 'text-amber-300' : 'text-red-300'}`}>
          {status}
        </div>
        <span className="text-xs font-semibold text-slate-300">VFR - Student Pilot - Day</span>
      </div>
      <div className="mt-4 space-y-2">
        {result.conditions.slice(0, 6).map((item) => (
          <div key={item.name} className="flex items-center gap-2 border-b border-white/8 pb-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${item.status === 'pass' ? 'bg-emerald-400' : item.status === 'caution' ? 'bg-amber-300' : 'bg-red-300'}`} />
            <span className="font-semibold capitalize text-slate-100">{item.name}</span>
            <span className="ml-auto text-slate-300">{item.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">Personal minimums evaluated for training.</p>
    </Card>
  );
}

function WeatherRadar() {
  const radar = useRadar();
  const centerWorld = lonLatToWorld(AIRPORT.lat, AIRPORT.lon, RADAR_ZOOM);
  const centerTileX = Math.floor(centerWorld.x / TILE_SIZE);
  const centerTileY = Math.floor(centerWorld.y / TILE_SIZE);
  const tiles = [];
  for (let x = centerTileX - 2; x <= centerTileX + 2; x += 1) {
    for (let y = centerTileY - 2; y <= centerTileY + 2; y += 1) {
      tiles.push({ x, y });
    }
  }
  const radarPath = radar.data?.radar?.path;
  const radarHost = radar.data?.host;

  return (
    <div className="weather-radar mt-5">
      {tiles.map((tile) => {
        const left = tile.x * TILE_SIZE - centerWorld.x;
        const top = tile.y * TILE_SIZE - centerWorld.y;
        const radarUrl = radarHost && radarPath
          ? `${radarHost}${radarPath}/256/${RADAR_ZOOM}/${tile.x}/${tile.y}/2/1_1.png`
          : null;
        return (
          <div key={`${tile.x}-${tile.y}`} className="absolute h-64 w-64 max-w-none" style={{ left: `calc(50% + ${left}px)`, top: `calc(50% + ${top}px)` }}>
            <img
              alt=""
              className="weather-radar-base absolute inset-0 h-64 w-64 max-w-none select-none"
              draggable="false"
              src={`https://tile.openstreetmap.org/${RADAR_ZOOM}/${tile.x}/${tile.y}.png`}
            />
            {radarUrl ? (
              <img
                alt=""
                className="weather-radar-layer absolute inset-0 h-64 w-64 max-w-none select-none"
                draggable="false"
                src={radarUrl}
              />
            ) : null}
          </div>
        );
      })}
      <div className="weather-radar-center">
        <span className="weather-radar-center-dot" title="KVBT - Thaden Field" />
      </div>
      <div className="weather-radar-caption">
        <span>Precip radar</span>
        <strong>{radar.data?.radar?.time_utc ? formatLocal(radar.data.radar.time_utc, 'h:mm a') : radar.isLoading ? 'Loading' : 'Unavailable'}</strong>
      </div>
      <a className="weather-radar-source" href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>
    </div>
  );
}

function WeatherCard() {
  const weather = useWeather();
  const metar = weather.data?.metar || {};
  const da = densityAltitude(AIRPORT.elevation_ft, metar.temp_c, metar.altimeter_inhg);
  return (
    <Card title="Weather" icon={Cloud} className="area-weather">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cloud size={32} className="text-white" />
          <div className="text-3xl font-black text-white">{metar.temp_c != null ? `${Math.round(metar.temp_c)}C` : '--'}</div>
          <div className="text-sm text-slate-300">{metar.sky_condition || 'Current'}</div>
        </div>
        <div className="text-xs text-slate-400">Observed {formatLocal(metar.observed_utc, 'h:mm a')}</div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/10 pt-4 text-sm">
        <Metric label="Wind" value={`${metar.wind_dir_deg ?? 'VRB'} / ${metar.wind_speed_kt ?? '--'} kt`} />
        <Metric label="Visibility" value={`${metar.visibility_sm ?? '--'} sm`} />
        <Metric label="Dew Point" value={`${metar.dewpoint_c ?? '--'}C`} />
        <Metric label="Altimeter" value={`${metar.altimeter_inhg ?? '--'} inHg`} />
        <Metric label="Density Alt." value={da == null ? '--' : `${da.toLocaleString()} ft`} />
        <Metric label="Category" value={metar.flight_category || '--'} />
      </div>
      <WeatherRadar />
    </Card>
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

function NextLessonCard() {
  const [open, setOpen] = useState(false);
  const lesson = useLesson();
  const next = lesson.data?.next_lesson;
  return (
    <Card title="Next Lesson" icon={CalendarDays} className="area-lesson">
      {next ? (
        <div>
          <div className="text-lg font-bold text-white">{formatLocal(next.start_utc, 'EEE, MMM d')}</div>
          <div className="mt-1 text-sm text-slate-300">{formatLocal(next.start_utc, 'h:mm a')} - {formatLocal(next.end_utc, 'h:mm a')}</div>
          <p className="mt-3 text-sm text-slate-300">{next.notes || 'Lesson block scheduled.'}</p>
        </div>
      ) : (
        <div className="text-sm text-slate-300">
          <p>No lesson scheduled.</p>
          <p>Add the next block manually.</p>
        </div>
      )}
      <button className="ops-primary-button mt-auto w-full" onClick={() => setOpen(true)}>Schedule Lesson</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Schedule lesson">
        <NextLessonForm onSave={async (value) => { await lesson.save(value); await lesson.refetch(); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </Card>
  );
}

function CheckrideCard() {
  const entries = useBlob('logbook', 'entries');
  const maneuvers = useBlob('training', 'maneuvers');
  const ground = useBlob('training', 'ground_school');
  const written = useBlob('training', 'written_exam');
  const readiness = computeReadiness({ entries: entries.data || [], maneuvers: maneuvers.data || {}, groundSchool: ground.data || {}, writtenExam: written.data || {} });
  return (
    <Card title="Checkride Readiness" icon={Trophy} className="area-checkride">
      <div className="flex items-end justify-between">
        <div className="text-5xl font-black text-white">{readiness.score}%</div>
        <div className="text-xs text-slate-300">{readiness.remaining.length} items left</div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-sky-300" style={{ width: `${readiness.score}%` }} /></div>
      <div className="mt-4 space-y-2 text-sm">
        {readiness.remaining.slice(0, 6).map((item) => (
          <div key={item.label} className="flex justify-between gap-3">
            <span className="text-slate-300">{item.label}</span>
            <strong className="text-white">{Number(item.current).toFixed(item.current % 1 ? 1 : 0)} / {item.required}</strong>
          </div>
        ))}
      </div>
      <a className="mt-auto inline-flex text-xs font-bold text-orange-500 hover:text-orange-400" href={PPL_ACS_URL} target="_blank" rel="noreferrer">
        View requirements
      </a>
    </Card>
  );
}

function TrainingProgressCard() {
  const entries = useBlob('logbook', 'entries');
  const hours = aggregateHours(entries.data || []);
  const rows = [
    ['Dual', hours.dual, 20],
    ['Solo', hours.solo, 10],
    ['Solo XC', hours.soloXc, 5],
    ['Night', hours.night, 3],
    ['Instrument', hours.instrument, 3],
  ];
  return (
    <Card title="Training Progress" icon={Gauge} className="area-progress">
      <div className="grid grid-cols-[130px_1fr] gap-5">
        <div className="progress-ring">
          <div className="text-2xl font-black text-white">{hours.total.toFixed(1)}</div>
          <div className="text-xs text-slate-300">of 40 hrs</div>
        </div>
        <div className="space-y-2 text-sm">
          {rows.map(([label, value, total]) => (
            <div key={label} className="flex justify-between border-b border-white/8 pb-1">
              <span className="text-slate-300">{label}</span>
              <strong className="text-white">{value.toFixed(1)} / {total}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 text-xs font-bold text-orange-500">View full progress</div>
    </Card>
  );
}

function AircraftCard() {
  const selected = useBlob('config', 'selected_aircraft_tail');
  const aircraft = FLEET.find((item) => item.tail === selected.data) || PRIMARY_AIRCRAFT;
  return (
    <Card title="Aircraft" icon={Plane} className="area-aircraft">
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div>
          <select className="mb-3 w-full rounded-md border border-white/10 bg-slate-950/55 px-3 py-2 text-sm font-semibold text-white" value={aircraft.tail} onChange={(event) => selected.save(event.target.value)}>
            {FLEET.map((item) => <option key={item.tail} value={item.tail}>{item.type} - {item.tail}</option>)}
          </select>
          <div className="text-2xl font-black text-white">{aircraft.type}</div>
          <div className="text-sm font-semibold text-slate-300">{aircraft.tail}</div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <Metric label="Availability" value="Available" />
            <Metric label="Fuel" value={aircraft.fuel_type || 'SIM'} />
            <Metric label="Rate" value={`$${aircraft.hourly_rate}/hr`} />
          </div>
        </div>
        <div className="aircraft-visual">
          {aircraft.image_url ? (
            <img className="h-full w-full object-cover" src={aircraft.image_url} alt={`${aircraft.tail} ${aircraft.type}`} />
          ) : (
            <Plane size={84} />
          )}
          <div className="aircraft-visual-label">{aircraft.tail}</div>
        </div>
      </div>
      <div className="mt-4 border-t border-white/10 pt-3 text-sm text-slate-300">{aircraft.equipment}</div>
      {aircraft.tail !== 'Simulator' ? (
        <a className="mt-auto inline-flex text-xs font-bold text-orange-500 hover:text-orange-400" href={flightAwareAircraftUrl(aircraft.tail)} target="_blank" rel="noreferrer">
          View aircraft details
        </a>
      ) : (
        <div className="mt-auto text-xs font-bold text-slate-500">Simulator profile unavailable</div>
      )}
    </Card>
  );
}

function GroundSchoolCard() {
  const [open, setOpen] = useState(false);
  const ground = useBlob('training', 'ground_school');
  const tests = useBlob('training', 'practice_tests');
  const topics = Object.entries(ground.data || {});
  const complete = topics.filter(([, state]) => state.status === 'complete').length;
  const pct = topics.length ? Math.round((complete / topics.length) * 100) : 0;
  return (
    <Card title="Ground School" icon={BookOpen} className="area-ground">
      <div className="grid grid-cols-[96px_1fr] gap-4">
        <div className="progress-ring small">
          <div className="text-xl font-black text-white">{pct}%</div>
          <div className="text-xs text-slate-300">Complete</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {topics.slice(0, 6).map(([topic, state]) => (
            <div key={topic} className="rounded-md bg-white/6 px-3 py-2 text-xs">
              <div className="truncate font-semibold text-white">{labelize(topic)}</div>
              <div className="text-slate-400">{state.status.replace('_', ' ')}</div>
            </div>
          ))}
        </div>
      </div>
      <button className="mt-4 text-xs font-bold text-orange-500" onClick={() => setOpen(true)}>Add practice test</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add practice test">
        <PracticeTestForm onSave={async (test) => { await tests.save([...(tests.data || []), test]); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </Card>
  );
}

function ExpensesCard() {
  const [open, setOpen] = useState(false);
  const expenses = useBlob('expenses', 'entries');
  const logbook = useBlob('logbook', 'entries');
  const list = expenses.data || [];
  const hours = aggregateHours(logbook.data || []);
  const projection = projectedTotalCost(list, hours.total);
  const total = list.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const bars = list.slice(0, 5);
  return (
    <Card title="Expenses" icon={Wallet} className="area-expenses">
      <div className="flex justify-between">
        <Metric label="This Month" value={`$${Math.round(total).toLocaleString()}`} />
        <Metric label="Projected" value={`$${projection.projected.toLocaleString()}`} />
      </div>
      <div className="mt-5 flex h-20 items-end gap-5 border-b border-white/10">
        {bars.length ? bars.map((item) => <div key={item.id} className="w-8 bg-slate-500/70" style={{ height: `${Math.max(12, Math.min(72, Number(item.total || 0) / 5))}px` }} />) : <div className="text-sm text-slate-400">No expenses yet.</div>}
      </div>
      <button className="mt-4 text-xs font-bold text-orange-500" onClick={() => setOpen(true)}>Add expense</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add expense">
        <ExpenseEntryForm logbookEntries={logbook.data || []} onSave={async (expense) => { await expenses.save([expense, ...list]); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </Card>
  );
}

function fuelStatusTone(deltaPct) {
  if (deltaPct <= -5) return 'text-emerald-300';
  if (deltaPct >= 5) return 'text-red-300';
  return 'text-slate-300';
}

function FuelIndex({ label, average, deltaPct, status, positionPct }) {
  return (
    <div className="fuel-index-row">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-400">{label} avg {money(average)}</span>
        <strong className={fuelStatusTone(deltaPct)}>{signedPct(deltaPct)} {status}</strong>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="fuel-index flex-1">
          <span className="fuel-index-mid" />
          <span className="fuel-index-dot" style={{ left: `${positionPct ?? 50}%` }} />
        </div>
      </div>
    </div>
  );
}

function FuelPriceRow({ fuel }) {
  return (
    <div className="fuel-price-row">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-white">{fuel.label}</div>
          <div className="text-xs text-slate-400">{fuel.service}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-white">{money(fuel.price_per_gal)}</div>
          <div className="text-xs text-slate-400">per gal</div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <FuelIndex
          label="Southern"
          average={fuel.regional_avg}
          deltaPct={fuel.market_delta_pct}
          status={fuel.market_status}
          positionPct={fuel.index_position_pct}
        />
      </div>
    </div>
  );
}

function FuelCostCard() {
  const fuel = useFuel();
  const fuels = fuel.data?.local?.fuels || [];
  const updated = fuel.data?.local?.updated;
  return (
    <Card title="Fuel Prices" icon={Fuel} className="area-fuel">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {fuels.length ? fuels.map((item) => <FuelPriceRow key={item.code} fuel={item} />) : (
          <div className="rounded-md border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            {fuel.isLoading ? 'Loading fuel prices...' : 'Fuel prices unavailable.'}
          </div>
        )}
      </div>
      <div className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Updated {updated || '--'}</span>
          <a className="font-bold text-orange-400 hover:text-orange-300" href="https://www.airnav.com/airport/KVBT/LEGENDS_AIR_CENTER" target="_blank" rel="noreferrer">AirNav source</a>
        </div>
        <div className="mt-2 text-slate-400">{fuel.data?.market?.trend?.summary || 'Market trend unavailable.'}</div>
      </div>
    </Card>
  );
}

function LogbookSummaryCard() {
  const [open, setOpen] = useState(false);
  const entries = useBlob('logbook', 'entries');
  const list = entries.data || [];
  const hours = aggregateHours(list);
  return (
    <Card title="Logbook Summary" icon={BookOpen} className="area-logbook">
      <div className="grid gap-4 md:grid-cols-[170px_1fr]">
        <div className="space-y-2 text-sm">
          <Metric label="Total Time" value={`${hours.total.toFixed(1)} hrs`} />
          <Metric label="PIC Time" value={`${hours.solo.toFixed(1)} hrs`} />
          <Metric label="XC Time" value={`${hours.soloXc.toFixed(1)} hrs`} />
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Recent Entries</div>
          <div className="space-y-2 text-xs">
            {list.slice(0, 4).map((entry) => (
              <div key={entry.id} className="grid grid-cols-3 gap-3 text-slate-300">
                <span>{entry.date}</span><span>{entry.hobbs_total}</span><span>{entry.type}</span>
              </div>
            ))}
            {!list.length ? <div className="text-slate-400">No logbook entries yet.</div> : null}
          </div>
        </div>
      </div>
      <button className="mt-4 text-xs font-bold text-orange-500" onClick={() => setOpen(true)}>Add logbook entry</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add logbook entry">
        <LogbookEntryForm onSave={async (entry) => { await entries.save([entry, ...list]); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </Card>
  );
}

function BottomStrip() {
  const weather = useWeather();
  const metar = weather.data?.metar || {};
  return (
    <div className="ops-bottom-strip">
      <div className="flex items-center gap-3"><Gauge size={24} /> <span>{formatLocal(new Date().toISOString(), 'h:mm a zzz')}<small>{todayLocalISO()}</small></span></div>
      <div className="flex items-center gap-3"><Wind size={24} /> <span>{metar.wind_dir_deg ?? 'VRB'} / {metar.wind_speed_kt ?? '--'} kt<small>{metar.wind_gust_kt ? `Gust ${metar.wind_gust_kt}` : 'Calm gusts'}</small></span></div>
      <a className="flex items-center gap-3 hover:text-orange-400" href={AIRPORT_DIAGRAM_URL} target="_blank" rel="noreferrer"><RadioTower size={24} /> <span>RWY 18 / 36<small>6,006 ft x 100 ft</small></span></a>
      <a className="flex items-center gap-3 hover:text-orange-400" href={ATC_AUDIO_URL} target="_blank" rel="noreferrer"><Headphones size={24} /> <span>Bentonville Tower<small>119.975</small></span></a>
    </div>
  );
}

export default function App() {
  return (
    <div className="legends-dashboard min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <TopBar />
        <main className="px-5 py-5 xl:px-8">
          <Hero />
          <div className="ops-layout mt-5">
            <FlightReadinessCard />
            <WeatherCard />
            <TrafficScope title="Local Traffic (ADS-B)" className="area-traffic" compact />
            <FuelCostCard />
            <NextLessonCard />
            <AircraftCard />
            <CheckrideCard />
            <TrainingProgressCard />
            <GroundSchoolCard />
            <ExpensesCard />
            <LogbookSummaryCard />
          </div>
        </main>
        <BottomStrip />
      </div>
    </div>
  );
}
