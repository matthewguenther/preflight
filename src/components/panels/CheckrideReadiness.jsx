import { useBlob } from '../../hooks/useBlobs';
import { computeReadiness } from '../../lib/checkride';
import { PanelCard } from '../layout/PanelCard';
import { LoadingState } from '../ui/LoadingState';
import { ProgressBar } from '../ui/ProgressBar';

export function CheckrideReadiness() {
  // Training state is split across blob stores. computeReadiness is the join
  // point that turns those independent records into one weighted score.
  const entries = useBlob('logbook', 'entries');
  const maneuvers = useBlob('training', 'maneuvers');
  const ground = useBlob('training', 'ground_school');
  const written = useBlob('training', 'written_exam');
  if ([entries, maneuvers, ground, written].some((q) => q.isLoading)) return <PanelCard title="Checkride readiness"><LoadingState lines={4} /></PanelCard>;

  const readiness = computeReadiness({ entries: entries.data, maneuvers: maneuvers.data, groundSchool: ground.data, writtenExam: written.data });
  return (
    <PanelCard title="Checkride readiness">
      <div className="flex items-end justify-between">
        <div className="text-4xl font-semibold text-stone-950">{readiness.score}%</div>
        <div className="text-xs text-stone-500">{readiness.remaining.length} items left</div>
      </div>
      <div className="mt-3"><ProgressBar value={readiness.score} /></div>
      <div className="mt-4 max-h-40 space-y-2 overflow-y-auto text-sm">
        {readiness.remaining.slice(0, 6).map((item) => (
          <div key={item.label} className="flex justify-between gap-3">
            <span className="text-stone-600">{item.label}</span>
            <span className="font-semibold text-stone-900">{Number(item.current).toFixed(item.current % 1 ? 1 : 0)} / {item.required}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}
