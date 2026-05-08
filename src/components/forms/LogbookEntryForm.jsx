import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { AIRPORT, FLEET, MANEUVER_LIST, PRIMARY_AIRCRAFT, labelize } from '../../lib/constants';
import { todayLocalISO } from '../../lib/time';
import { normalizeLogbook, validateLogbook } from '../../lib/validation';
import { Field, inputClass } from './Field';

export function LogbookEntryForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    date: todayLocalISO(),
    aircraft_tail: PRIMARY_AIRCRAFT.tail,
    type: 'dual',
    hobbs_start: '',
    hobbs_end: '',
    landings_day: 0,
    landings_night: 0,
    night_hours: 0,
    instrument_hours: 0,
    xc_hours: 0,
    xc_distance_nm: 0,
    instructor: '',
    departure_airport: AIRPORT.icao,
    destination_airport: AIRPORT.icao,
    debrief_notes: '',
    maneuvers_practiced: [],
  });
  const normalized = useMemo(() => normalizeLogbook({ ...form, hobbs_total: 0 }), [form]);
  const validation = useMemo(() => validateLogbook(normalized), [normalized]);
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function toggleManeuver(maneuver) {
    const current = form.maneuvers_practiced;
    setForm({
      ...form,
      maneuvers_practiced: current.includes(maneuver) ? current.filter((item) => item !== maneuver) : [...current, maneuver],
    });
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!validation.valid) return;
        onSave({ ...normalized, id: uuid(), created_utc: new Date().toISOString() });
      }}
    >
      <Field label="Date" error={validation.errors.date}><input className={inputClass} type="date" value={form.date} onChange={set('date')} /></Field>
      <Field label="Type"><select className={inputClass} value={form.type} onChange={set('type')}><option value="dual">Dual</option><option value="solo">Solo</option><option value="sim">Sim</option><option value="checkride">Checkride</option></select></Field>
      <Field label="Hobbs start"><input className={inputClass} type="number" step="0.1" value={form.hobbs_start} onChange={set('hobbs_start')} /></Field>
      <Field label="Hobbs end" error={validation.errors.hobbs_end}><input className={inputClass} type="number" step="0.1" value={form.hobbs_end} onChange={set('hobbs_end')} /></Field>
      <Field label="Aircraft"><select className={inputClass} value={form.aircraft_tail} onChange={set('aircraft_tail')}>{FLEET.map((aircraft) => <option key={aircraft.tail}>{aircraft.tail}</option>)}</select></Field>
      <Field label="Instructor"><input className={inputClass} value={form.instructor} onChange={set('instructor')} /></Field>
      <Field label="Day landings" error={validation.errors.landings_day}><input className={inputClass} type="number" value={form.landings_day} onChange={set('landings_day')} /></Field>
      <Field label="Night landings" error={validation.errors.landings_night}><input className={inputClass} type="number" value={form.landings_night} onChange={set('landings_night')} /></Field>
      <Field label="Night hours"><input className={inputClass} type="number" step="0.1" value={form.night_hours} onChange={set('night_hours')} /></Field>
      <Field label="Instrument hours"><input className={inputClass} type="number" step="0.1" value={form.instrument_hours} onChange={set('instrument_hours')} /></Field>
      <Field label="XC hours"><input className={inputClass} type="number" step="0.1" value={form.xc_hours} onChange={set('xc_hours')} /></Field>
      <Field label="XC distance nm" error={validation.errors.xc_distance_nm}><input className={inputClass} type="number" value={form.xc_distance_nm} onChange={set('xc_distance_nm')} /></Field>
      <Field label="Departure"><input className={inputClass} value={form.departure_airport} onChange={set('departure_airport')} /></Field>
      <Field label="Destination" error={validation.errors.destination_airport}><input className={inputClass} value={form.destination_airport} onChange={set('destination_airport')} /></Field>
      <div className="sm:col-span-2">
        <Field label="Maneuvers">
          <div className="grid max-h-44 gap-2 overflow-y-auto rounded-md border border-stone-200 p-2 sm:grid-cols-2">
            {MANEUVER_LIST.map((maneuver) => (
              <label key={maneuver} className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={form.maneuvers_practiced.includes(maneuver)} onChange={() => toggleManeuver(maneuver)} />
                {labelize(maneuver)}
              </label>
            ))}
          </div>
        </Field>
      </div>
      <div className="sm:col-span-2"><Field label="Debrief notes"><textarea className={inputClass} rows="3" value={form.debrief_notes} onChange={set('debrief_notes')} /></Field></div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <span className="text-sm font-semibold text-stone-700">Hobbs total: {normalized.hobbs_total || 0}</span>
        <button className="rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!validation.valid}>Save</button>
        <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
