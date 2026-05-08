export function MetricCard({ label, value, subtext }) {
  return (
    <div className="tactical-panel rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-stone-950">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-stone-500">{subtext}</div> : null}
    </div>
  );
}
