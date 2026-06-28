import { RefreshCw } from 'lucide-react';
import { AIRPORT } from '../../lib/constants';
import { densityAltitude } from '../../lib/densityAlt';
import { formatLocal, isOlderThan } from '../../lib/time';
import { useWeather } from '../../hooks/useWeather';
import { Badge } from '../ui/Badge';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';
import { StaleIndicator } from '../ui/StaleIndicator';
import { PanelCard } from '../layout/PanelCard';

export function Weather() {
  const weather = useWeather();
  if (weather.isLoading) return <PanelCard title="Weather"><LoadingState /></PanelCard>;
  if (weather.isError) return <PanelCard title="Weather"><ErrorState error={weather.error} onRetry={weather.refetch} /></PanelCard>;

  const metar = weather.data.metar || {};
  const da = densityAltitude(AIRPORT.elevation_ft, metar.temp_c, metar.altimeter_inhg);
  const stale = isOlderThan(weather.data.fetched_utc, 10 * 60 * 1000);
  const categoryTone = metar.flight_category === 'VFR' ? 'green' : 'red';

  return (
    <PanelCard title="Weather" action={weather.isFetching ? <RefreshCw className="animate-spin text-stone-400" size={16} /> : stale ? <StaleIndicator timestamp={weather.data.fetched_utc} /> : null} className="md:col-span-1 md:row-span-2">
      <div className="flex items-center justify-between">
        <Badge tone={categoryTone}>{metar.flight_category || 'Unknown'}</Badge>
        <div className="text-xs text-stone-500">Observed {formatLocal(metar.observed_utc, 'h:mm a')}</div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-stone-500">Wind</dt><dd className="font-semibold text-stone-950">{metar.wind_dir_deg ?? 'VRB'} / {metar.wind_speed_kt ?? 0} kt{metar.wind_gust_kt ? ` G${metar.wind_gust_kt}` : ''}</dd></div>
        <div><dt className="text-stone-500">Visibility</dt><dd className="font-semibold text-stone-950">{metar.visibility_sm ?? '--'} sm</dd></div>
        <div><dt className="text-stone-500">Temp / dew</dt><dd className="font-semibold text-stone-950">{metar.temp_c ?? '--'} / {metar.dewpoint_c ?? '--'} C</dd></div>
        <div><dt className="text-stone-500">Altimeter</dt><dd className="font-semibold text-stone-950">{metar.altimeter_inhg ?? '--'}</dd></div>
        <div className="col-span-2"><dt className="text-stone-500">Density altitude</dt><dd className="font-semibold text-stone-950">{da == null ? '--' : `${da.toLocaleString()} ft`} <span className="text-xs font-normal text-stone-500">Approximate rule-of-thumb</span></dd></div>
      </dl>
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Winds aloft</h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          {['3000_ft', '6000_ft', '9000_ft'].map((level) => {
            const row = weather.data.winds_aloft?.[level];
            return <div key={level} className="rounded-md bg-stone-50 p-2"><div className="text-xs text-stone-500">{level.replace('_ft', '')} ft</div><div className="font-semibold">{row ? `${row.dir_deg}/${row.speed_kt}` : '--'}</div></div>;
          })}
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">TAF</h3>
        <div className="mt-2 space-y-2 text-sm">
          {(weather.data.taf?.periods || []).slice(0, 4).length ? weather.data.taf.periods.slice(0, 4).map((period, index) => (
            <div key={index} className="rounded-md bg-stone-50 p-2">
              <div className="font-medium">{formatLocal(period.from_utc, 'EEE h a')} - {formatLocal(period.to_utc, 'h a')}</div>
              <div className="text-stone-500">{period.wind_dir_deg ?? 'VRB'} / {period.wind_speed_kt} kt · {period.visibility_sm ?? '--'} sm · {period.sky_condition || 'No sky detail'}</div>
            </div>
          )) : <div className="text-sm text-stone-500">No TAF returned for this airport.</div>}
        </div>
      </div>
      <pre className="mt-4 whitespace-pre-wrap rounded-md bg-stone-950 p-3 font-mono text-xs text-stone-100">{metar.raw || 'No METAR available'}</pre>
    </PanelCard>
  );
}
