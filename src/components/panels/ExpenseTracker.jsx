import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBlob } from '../../hooks/useBlobs';
import { aggregateHours, projectedTotalCost } from '../../lib/checkride';
import { ExpenseEntryForm } from '../forms/ExpenseEntryForm';
import { Modal } from '../forms/Modal';
import { PanelCard } from '../layout/PanelCard';
import { Badge } from '../ui/Badge';
import { LoadingState } from '../ui/LoadingState';

function inRange(entry, range) {
  if (range === 'all') return true;
  if (range === '8') return true;
  const days = Number(range);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(entry.date).getTime() >= cutoff;
}

export function ExpenseTracker() {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState('30');
  const expenses = useBlob('expenses', 'entries');
  const logbook = useBlob('logbook', 'entries');
  if (expenses.isLoading || logbook.isLoading) return <PanelCard title="Expenses"><LoadingState /></PanelCard>;

  const list = expenses.data || [];
  const logs = logbook.data || [];
  const totalSpent = list.reduce((sum, expense) => sum + Number(expense.total || 0), 0);
  const hours = aggregateHours(logs);
  const projection = projectedTotalCost(list, hours.total);
  const filtered = list.filter((entry) => inRange(entry, range)).sort((a, b) => a.date.localeCompare(b.date));
  const chartData = (range === '8' ? filtered.slice(-8) : filtered).map((entry) => ({
    ...entry,
    label: entry.date.slice(5),
    total: Number(entry.total),
    hobbs_hours: Number(entry.hobbs_hours),
  }));

  return (
    <PanelCard title="Expenses" action={<button className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => setOpen(true)}><Plus size={16} /> Add</button>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><div className="text-xs text-stone-500">Spent</div><div className="text-xl font-semibold">${Math.round(totalSpent).toLocaleString()}</div></div>
        <div><div className="text-xs text-stone-500">Projected</div><div className="text-xl font-semibold">${projection.projected.toLocaleString()}</div></div>
        <div><div className="text-xs text-stone-500">Per hour</div><div className="text-xl font-semibold">${projection.cost_per_hour}<span className="ml-2 align-middle"><Badge tone="blue">{projection.confidence}</Badge></span></div></div>
      </div>
      <div className="mt-4 flex gap-2">
        {[['8', '8 lessons'], ['30', '30 days'], ['90', '90 days'], ['all', 'All']].map(([value, label]) => (
          <button key={value} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${range === value ? 'bg-sky-900 text-white' : 'bg-stone-100 text-stone-700'}`} onClick={() => setRange(value)}>{label}</button>
        ))}
      </div>
      <div className="mt-4 h-56">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis yAxisId="left" width={48} />
              <YAxis yAxisId="right" orientation="right" width={32} />
              <Tooltip />
              <Bar yAxisId="left" dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="hobbs_hours" stroke="#b45309" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div className="flex h-full items-center text-sm text-stone-500">No expenses yet.</div>}
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add expense">
        <ExpenseEntryForm logbookEntries={logs} onSave={async (expense) => { await expenses.save([expense, ...list]); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </PanelCard>
  );
}
