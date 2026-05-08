import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { todayLocalISO } from '../../lib/time';
import { Field, inputClass } from './Field';

export function PracticeTestForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ date: todayLocalISO(), questions_total: 60, questions_correct: 0, weak_areas: '' });
  const score = Math.round((Number(form.questions_correct || 0) / Number(form.questions_total || 1)) * 100);
  const valid = form.date && Number(form.questions_total) > 0 && Number(form.questions_correct) <= Number(form.questions_total);
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      if (valid) onSave({
        id: uuid(),
        date: form.date,
        score_pct: score,
        questions_total: Number(form.questions_total),
        questions_correct: Number(form.questions_correct),
        weak_areas: form.weak_areas.split(',').map((item) => item.trim()).filter(Boolean),
      });
    }}>
      <Field label="Date"><input className={inputClass} type="date" value={form.date} onChange={set('date')} /></Field>
      <Field label="Questions total"><input className={inputClass} type="number" value={form.questions_total} onChange={set('questions_total')} /></Field>
      <Field label="Correct"><input className={inputClass} type="number" value={form.questions_correct} onChange={set('questions_correct')} /></Field>
      <Field label="Weak areas"><input className={inputClass} value={form.weak_areas} onChange={set('weak_areas')} /></Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <span className="text-sm font-semibold text-stone-700">Score: {score}%</span>
        <button className="rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!valid}>Save</button>
        <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
