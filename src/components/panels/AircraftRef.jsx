import { useState } from 'react';
import { useBlob } from '../../hooks/useBlobs';
import { AIRPORT, FLEET, PRIMARY_AIRCRAFT } from '../../lib/constants';
import { crosswindComponent } from '../../lib/crosswind';
import { PanelCard } from '../layout/PanelCard';
import { LoadingState } from '../ui/LoadingState';

export function AircraftRef() {
  const selected = useBlob('config', 'selected_aircraft_tail');
  const [weight, setWeight] = useState(2550);
  const [windDir, setWindDir] = useState(180);
  const [windSpeed, setWindSpeed] = useState(10);
  if (selected.isLoading) return <PanelCard title="Aircraft"><LoadingState /></PanelCard>;

  const aircraft = FLEET.find((item) => item.tail === selected.data) || PRIMARY_AIRCRAFT;
  const hasSpeeds = Boolean(aircraft.vspeeds);
  const va = hasSpeeds
    ? aircraft.vspeeds.Va_table.find((row) => Number(row.weight_lb) === Number(weight)) || aircraft.vspeeds.Va_table[0]
    : null;
  const speeds = hasSpeeds ? Object.entries(aircraft.vspeeds).filter(([key]) => key !== 'Va_table') : [];

  return (
    <PanelCard title="Aircraft">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Tail</span>
          <select className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" value={aircraft.tail} onChange={(event) => selected.save(event.target.value)}>
            {FLEET.map((item) => <option key={item.tail} value={item.tail}>{item.tail} - {item.type}</option>)}
          </select>
        </label>
        {hasSpeeds ? (
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Va weight</span>
            <select className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" value={weight} onChange={(event) => setWeight(event.target.value)}>
              {aircraft.vspeeds.Va_table.map((row) => <option key={row.weight_lb} value={row.weight_lb}>{row.weight_lb} lb</option>)}
            </select>
          </label>
        ) : (
          <div className="rounded-md border border-cyan-300/15 bg-cyan-300/5 p-3 text-sm">
            <div className="text-stone-500">V-speeds</div>
            <div className="font-semibold">Verify POH for this aircraft</div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-stone-50 p-3 text-sm">
          <div className="text-stone-500">Aircraft</div>
          <div className="font-semibold">{aircraft.type}</div>
        </div>
        <div className="rounded-md bg-stone-50 p-3 text-sm">
          <div className="text-stone-500">Category</div>
          <div className="font-semibold">{aircraft.rules} - ${aircraft.hourly_rate}/hr</div>
        </div>
        <div className="rounded-md bg-stone-50 p-3 text-sm">
          <div className="text-stone-500">Fuel</div>
          <div className="font-semibold">
            {aircraft.fuel_type ? `${aircraft.fuel_type}${aircraft.fuel_burn_gph ? ` - ${aircraft.fuel_burn_gph} gph` : ''}` : 'Simulator'}
          </div>
        </div>
        <div className="rounded-md bg-stone-50 p-3 text-sm">
          <div className="text-stone-500">Va</div>
          <div className="font-semibold">{va ? `${va.kias} KIAS at ${va.weight_lb} lb` : 'POH required'}</div>
        </div>
        <div className="rounded-md bg-stone-50 p-3 text-sm sm:col-span-2">
          <div className="text-stone-500">Equipment</div>
          <div className="font-semibold">{aircraft.equipment}</div>
        </div>
      </div>

      <div className="mt-4 max-h-44 overflow-y-auto">
        {hasSpeeds ? (
          <table className="w-full text-sm">
            <tbody>
              {speeds.map(([key, value]) => (
                <tr key={key} className="border-t border-stone-100">
                  <td className="py-2 font-semibold">{key}</td>
                  <td className="py-2">{value.kias} KIAS</td>
                  <td className="py-2 text-stone-500">{value.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
            V-speed table is not loaded for this airframe. Use the aircraft POH or instructor-provided checklist.
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-stone-200 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Crosswind calculator</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" type="number" value={windDir} onChange={(event) => setWindDir(event.target.value)} aria-label="Wind direction" />
          <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" type="number" value={windSpeed} onChange={(event) => setWindSpeed(event.target.value)} aria-label="Wind speed" />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {AIRPORT.runways.map((runway) => (
            <div key={runway.id} className="rounded-md bg-stone-50 p-2 text-sm">
              Runway {runway.id}: <span className="font-semibold">{crosswindComponent(windDir, windSpeed, runway.heading_deg)} kt</span>
            </div>
          ))}
        </div>
      </div>
    </PanelCard>
  );
}
