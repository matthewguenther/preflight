import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useBlob } from '../../hooks/useBlobs';
import { PART_61_REQUIREMENTS } from '../../lib/constants';
import { aggregateHours } from '../../lib/checkride';
import { LogbookEntryForm } from '../forms/LogbookEntryForm';
import { Modal } from '../forms/Modal';
import { PanelCard } from '../layout/PanelCard';
import { LoadingState } from '../ui/LoadingState';
import { ProgressBar } from '../ui/ProgressBar';

export function Logbook() {
  const [open, setOpen] = useState(false);
  const entries = useBlob('logbook', 'entries');
  if (entries.isLoading) return <PanelCard title="Logbook" className="md:col-span-2"><LoadingState /></PanelCard>;
  const list = entries.data || [];
  const hours = aggregateHours(list);
  const progress = [
    ['Total', hours.total, PART_61_REQUIREMENTS.total_hours],
    ['Dual', hours.dual, PART_61_REQUIREMENTS.dual_hours],
    ['Solo', hours.solo, PART_61_REQUIREMENTS.solo_hours],
    ['Solo XC', hours.soloXc, PART_61_REQUIREMENTS.solo_xc_hours],
    ['Night', hours.night, PART_61_REQUIREMENTS.night_hours],
    ['Instrument', hours.instrument, PART_61_REQUIREMENTS.instrument_hours],
  ];

  return (
    <PanelCard title="Logbook" className="md:col-span-2" action={<button className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => setOpen(true)}><Plus size={16} /> Add</button>}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3">
          {progress.map(([label, current, required]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-semibold">{current.toFixed(1)} / {required}</span></div>
              <ProgressBar value={current} max={required} />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((entry) => (
            <div key={entry.id} className="rounded-md bg-stone-50 p-3 text-sm">
              <div className="flex justify-between"><span className="font-semibold">{entry.date} · {entry.type}</span><span>{entry.hobbs_total} hr</span></div>
              <div className="mt-1 text-stone-500">{entry.debrief_notes || 'No notes'}</div>
            </div>
          ))}
          {!list.length ? <div className="text-sm text-stone-500">No logbook entries yet.</div> : null}
        </div>
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add logbook entry">
        <LogbookEntryForm onSave={async (entry) => { await entries.save([entry, ...list]); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </PanelCard>
  );
}
