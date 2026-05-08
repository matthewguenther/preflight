import { formatLocal } from '../../lib/time';

export function StaleIndicator({ timestamp }) {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
      Stale: {formatLocal(timestamp, 'MMM d h:mm a')}
    </span>
  );
}
