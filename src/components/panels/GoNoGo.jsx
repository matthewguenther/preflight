import { Settings } from 'lucide-react';
import { useState } from 'react';
import { useBlob } from '../../hooks/useBlobs';
import { useTfr } from '../../hooks/useTfr';
import { useWeather } from '../../hooks/useWeather';
import { evaluateGoNoGo } from '../../lib/goNoGo';
import { Modal } from '../forms/Modal';
import { PersonalMinsForm } from '../forms/PersonalMinsForm';
import { PanelCard } from '../layout/PanelCard';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';
import { StatusDot } from '../ui/StatusDot';

const styles = {
  go: 'text-emerald-700',
  caution: 'text-amber-700',
  no_go: 'text-red-700',
};

export function GoNoGo() {
  const [open, setOpen] = useState(false);
  const weather = useWeather();
  const tfr = useTfr();
  const minimums = useBlob('config', 'personal_minimums');

  if (weather.isLoading || minimums.isLoading) return <PanelCard title="Go / No-Go"><LoadingState /></PanelCard>;
  if (weather.isError) return <PanelCard title="Go / No-Go"><ErrorState error={weather.error} onRetry={weather.refetch} /></PanelCard>;

  const result = evaluateGoNoGo(weather.data?.metar, minimums.data, tfr.data?.tfrs_nearby || []);
  const label = result.status === 'no_go' ? 'NO-GO' : result.status.toUpperCase();

  return (
    <PanelCard
      title="Go / No-Go"
      action={<button className="rounded-md p-2 text-stone-500 hover:bg-stone-100" onClick={() => setOpen(true)} aria-label="Edit minimums"><Settings size={17} /></button>}
      className="md:col-span-1 md:row-span-2"
    >
      <div className={`text-5xl font-bold tracking-normal ${styles[result.status]}`}>{label}</div>
      <div className="mt-5 space-y-3">
        {result.conditions.map((item) => (
          <div key={item.name} className="flex items-start gap-3 text-sm">
            <StatusDot status={item.status} />
            <div className="flex-1">
              <div className="font-semibold capitalize text-stone-900">{item.name}</div>
              <div className="text-stone-500">{item.value} · Limit {item.limit}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-stone-200 pt-4 text-xs text-stone-500">
        Mins: {minimums.data.ceiling_ft} ft ceiling, {minimums.data.visibility_sm} sm, {minimums.data.crosswind_kt} kt xwind
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Personal minimums">
        <PersonalMinsForm initial={minimums.data} onSave={async (value) => { await minimums.save(value); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </PanelCard>
  );
}
