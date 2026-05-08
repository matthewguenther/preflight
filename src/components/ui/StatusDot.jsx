export function StatusDot({ status }) {
  const color = status === 'pass' ? 'bg-emerald-300' : status === 'caution' ? 'bg-amber-300' : 'bg-red-300';
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}
