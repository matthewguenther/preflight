export function ProgressBar({ value, max = 100, tone = 'emerald' }) {
  const pct = Math.max(0, Math.min(100, (Number(value || 0) / max) * 100));
  const color = tone === 'amber' ? 'bg-amber-400' : tone === 'red' ? 'bg-red-400' : 'bg-cyan-300';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
