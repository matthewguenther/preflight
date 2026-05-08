export function PanelCard({ title, action, children, className = '' }) {
  return (
    <section className={`tactical-panel rounded-lg border border-stone-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-4 flex min-h-8 items-start justify-between gap-3">
        <h2 className="tactical-panel-title text-sm font-semibold uppercase tracking-wide text-stone-600">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
