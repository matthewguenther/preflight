export function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs font-medium text-red-700">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100';
