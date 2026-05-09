import { useMemo, useState } from 'react';
import { validatePersonalMinimums } from '../../lib/validation';
import { Field, inputClass } from './Field';

export function PersonalMinsForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  // The form stores numbers because go/no-go comparisons read these values
  // directly from the saved config blob.
  const validation = useMemo(() => validatePersonalMinimums(form), [form]);
  const set = (field) => (event) => setForm({ ...form, [field]: Number(event.target.value) });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (validation.valid) onSave(form);
      }}
    >
      {[
        ['ceiling_ft', 'Ceiling ft'],
        ['visibility_sm', 'Visibility sm'],
        ['crosswind_kt', 'Crosswind kt'],
        ['wind_kt', 'Wind kt'],
        ['caution_margin_pct', 'Caution margin %'],
      ].map(([field, label]) => (
        <Field key={field} label={label} error={validation.errors[field]}>
          <input className={inputClass} type="number" value={form[field]} onChange={set(field)} />
        </Field>
      ))}
      <div className="flex gap-2 sm:col-span-2">
        <button className="rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!validation.valid}>
          Save
        </button>
        <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
