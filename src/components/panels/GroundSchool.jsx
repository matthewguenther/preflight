import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBlob } from '../../hooks/useBlobs';
import { labelize } from '../../lib/constants';
import { todayLocalISO } from '../../lib/time';
import { Modal } from '../forms/Modal';
import { PracticeTestForm } from '../forms/PracticeTestForm';
import { PanelCard } from '../layout/PanelCard';
import { Badge } from '../ui/Badge';
import { LoadingState } from '../ui/LoadingState';

const nextStatus = { not_started: 'in_progress', in_progress: 'complete', complete: 'not_started' };
const tones = { not_started: 'gray', in_progress: 'amber', complete: 'green' };

export function GroundSchool() {
  const [open, setOpen] = useState(false);
  const ground = useBlob('training', 'ground_school');
  const tests = useBlob('training', 'practice_tests');
  if (ground.isLoading || tests.isLoading) return <PanelCard title="Ground school"><LoadingState /></PanelCard>;

  const topics = ground.data || {};
  const testList = tests.data || [];
  const best = testList.length ? Math.max(...testList.map((test) => test.score_pct)) : 0;
  const last = testList.at(-1)?.score_pct || 0;

  async function cycle(topic) {
    const current = topics[topic] || { status: 'not_started' };
    await ground.save({ ...topics, [topic]: { ...current, status: nextStatus[current.status], last_updated: todayLocalISO() } });
  }

  return (
    <PanelCard title="Ground school" action={<button className="inline-flex items-center gap-2 rounded-md bg-sky-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => setOpen(true)}><Plus size={16} /> Test</button>}>
      <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
        {Object.entries(topics).map(([topic, state]) => (
          <button key={topic} className="flex items-center justify-between gap-2 rounded-md border border-stone-200 px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => cycle(topic)}>
            <span className="truncate">{labelize(topic)}</span>
            <Badge tone={tones[state.status]}>{state.status.replace('_', ' ')}</Badge>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="text-sm"><div className="text-stone-500">Best</div><div className="font-semibold">{best}%</div></div>
        <div className="text-sm"><div className="text-stone-500">Last</div><div className="font-semibold">{last}%</div></div>
        <div className="text-sm"><div className="text-stone-500">Count</div><div className="font-semibold">{testList.length}</div></div>
      </div>
      <div className="mt-4 h-32">
        {testList.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={testList}>
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} width={28} />
              <Tooltip />
              <Line type="monotone" dataKey="score_pct" stroke="#0369a1" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="flex h-full items-center text-sm text-stone-500">No practice tests yet.</div>}
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add practice test">
        <PracticeTestForm onSave={async (test) => { await tests.save([...testList, test]); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </PanelCard>
  );
}
