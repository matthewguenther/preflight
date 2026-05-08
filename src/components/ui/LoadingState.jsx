export function LoadingState({ lines = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="h-4 animate-pulse rounded bg-stone-200" style={{ width: `${92 - index * 12}%` }} />
      ))}
    </div>
  );
}
