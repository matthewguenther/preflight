const variants = {
  green: 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/35',
  amber: 'bg-amber-300/15 text-amber-100 ring-amber-300/40',
  red: 'bg-red-400/15 text-red-100 ring-red-300/40',
  blue: 'bg-cyan-300/15 text-cyan-100 ring-cyan-300/35',
  gray: 'bg-slate-300/10 text-slate-200 ring-slate-300/25',
};

export function Badge({ children, tone = 'gray' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${variants[tone]}`}>
      {children}
    </span>
  );
}
