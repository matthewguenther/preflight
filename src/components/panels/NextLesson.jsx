import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useLesson } from '../../hooks/useLesson';
import { formatLocal } from '../../lib/time';
import { Modal } from '../forms/Modal';
import { NextLessonForm } from '../forms/NextLessonForm';
import { PanelCard } from '../layout/PanelCard';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';

export function NextLesson() {
  const [open, setOpen] = useState(false);
  // useLesson may eventually prefer Flight Schedule Pro; today it falls back to
  // the manually saved scheduling blob exposed through the same hook contract.
  const lesson = useLesson();
  if (lesson.isLoading) return <PanelCard title="Next lesson"><LoadingState lines={3} /></PanelCard>;
  if (lesson.isError) return <PanelCard title="Next lesson"><ErrorState error={lesson.error} onRetry={lesson.refetch} /></PanelCard>;

  const next = lesson.data?.next_lesson;
  return (
    <PanelCard title="Next lesson" action={<button className="rounded-md p-2 text-stone-500 hover:bg-stone-100" onClick={() => setOpen(true)} aria-label="Edit lesson"><Pencil size={16} /></button>}>
      {next ? (
        <div>
          <div className="text-xl font-semibold text-stone-950">{formatLocal(next.start_utc, 'EEE, MMM d')}</div>
          <div className="mt-1 text-sm text-stone-600">{formatLocal(next.start_utc, 'h:mm a')} - {formatLocal(next.end_utc, 'h:mm a')}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-stone-500">Instructor</div><div className="font-semibold">{next.instructor || '--'}</div></div>
            <div><div className="text-stone-500">Aircraft</div><div className="font-semibold">{next.aircraft_tail}</div></div>
            <div className="col-span-2"><div className="text-stone-500">Focus</div><div className="font-semibold">{next.notes || '--'}</div></div>
          </div>
        </div>
      ) : <div className="text-sm text-stone-500">No lesson scheduled. Add the next block manually.</div>}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Edit next lesson">
        <NextLessonForm onSave={async (value) => { await lesson.save(value); await lesson.refetch(); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </PanelCard>
  );
}
