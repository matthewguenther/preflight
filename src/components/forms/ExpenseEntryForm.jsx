import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { todayLocalISO } from '../../lib/time';
import { normalizeExpense, validateExpense } from '../../lib/validation';
import { Field, inputClass } from './Field';

export function ExpenseEntryForm({ logbookEntries = [], onSave, onCancel }) {
  const latest = [...logbookEntries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const [form, setForm] = useState({
    date: latest?.date || todayLocalISO(),
    logbook_entry_id: latest?.id || '',
    hobbs_hours: latest?.hobbs_total || 0,
    aircraft_cost: 0,
    instructor_cost: 0,
    fees: 0,
    fuel_cost: 0,
    notes: '',
  });
  const normalized = useMemo(() => normalizeExpense({ ...form, total: 0 }), [form]);
  const validation = useMemo(() => validateExpense(normalized, logbookEntries), [normalized, logbookEntries]);
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (validation.valid) onSave({ ...normalized, id: uuid(), created_utc: new Date().toISOString() });
      }}
    >
      <Field label="Date" error={validation.errors.date}><input className={inputClass} type="date" value={form.date} onChange={set('date')} /></Field>
      <Field label="Linked logbook entry">
        <select className={inputClass} value={form.logbook_entry_id} onChange={set('logbook_entry_id')}>
          <option value="">None</option>
          {logbookEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.date} · {entry.hobbs_total} hr</option>)}
        </select>
      </Field>
      <Field label="Hobbs hours"><input className={inputClass} type="number" step="0.1" value={form.hobbs_hours} onChange={set('hobbs_hours')} /></Field>
      <Field label="Aircraft cost"><input className={inputClass} type="number" step="0.01" value={form.aircraft_cost} onChange={set('aircraft_cost')} /></Field>
      <Field label="Instructor cost"><input className={inputClass} type="number" step="0.01" value={form.instructor_cost} onChange={set('instructor_cost')} /></Field>
      <Field label="Fees"><input className={inputClass} type="number" step="0.01" value={form.fees} onChange={set('fees')} /></Field>
      <Field label="Fuel cost"><input className={inputClass} type="number" step="0.01" value={form.fuel_cost} onChange={set('fuel_cost')} /></Field>
      <Field label="Notes"><input className={inputClass} value={form.notes} onChange={set('notes')} /></Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <span className="text-sm font-semibold text-stone-700">Total: ${normalized.total.toFixed(2)}</span>
        <button className="rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!validation.valid}>Save</button>
        <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
