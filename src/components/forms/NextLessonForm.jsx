import { useState } from 'react';
import { FLEET, PRIMARY_AIRCRAFT } from '../../lib/constants';
import { toUTC } from '../../lib/time';
import { Field, inputClass } from './Field';

export function NextLessonForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    start: '',
    end: '',
    type: 'dual',
    instructor: '',
    aircraft_tail: PRIMARY_AIRCRAFT.tail,
    notes: '',
    ...initial,
  });
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });
  const valid = form.start && form.end && new Date(form.end) > new Date(form.start);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSave({
          start_utc: toUTC(form.start),
          end_utc: toUTC(form.end),
          type: form.type,
          instructor: form.instructor,
          aircraft_tail: form.aircraft_tail,
          notes: form.notes,
        });
      }}
    >
      <Field label="Start">
        <input className={inputClass} type="datetime-local" value={form.start} onChange={set('start')} />
      </Field>
      <Field label="End">
        <input className={inputClass} type="datetime-local" value={form.end} onChange={set('end')} />
      </Field>
      <Field label="Type">
        <select className={inputClass} value={form.type} onChange={set('type')}>
          <option value="dual">Dual</option>
          <option value="solo">Solo</option>
          <option value="ground">Ground</option>
        </select>
      </Field>
      <Field label="Aircraft">
        <select className={inputClass} value={form.aircraft_tail} onChange={set('aircraft_tail')}>
          {FLEET.map((aircraft) => <option key={aircraft.tail}>{aircraft.tail}</option>)}
        </select>
      </Field>
      <Field label="Instructor">
        <input className={inputClass} value={form.instructor} onChange={set('instructor')} />
      </Field>
      <Field label="Focus">
        <input className={inputClass} value={form.notes} onChange={set('notes')} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <button className="rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!valid}>
          Save
        </button>
        <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
