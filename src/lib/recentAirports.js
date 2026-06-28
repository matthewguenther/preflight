// Small localStorage-backed history of airports the user has loaded, used to
// offer one-tap quick picks on the search landing. Kept deliberately tiny and
// resilient: any storage failure (private mode, quota, disabled storage) just
// degrades to an empty list rather than throwing.
const STORAGE_KEY = 'preflight:recentAirports';
const MAX_RECENTS = 5;

export function getRecentAirports() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((code) => typeof code === 'string' && code) : [];
  } catch {
    return [];
  }
}

export function addRecentAirport(code) {
  const value = String(code || '').trim().toUpperCase();
  if (!value) return getRecentAirports();
  // Newest first, de-duplicated, capped. Re-selecting an existing airport moves
  // it back to the front instead of creating a duplicate entry.
  const next = [value, ...getRecentAirports().filter((entry) => entry !== value)].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore write failures; the in-memory return value still reflects the add.
  }
  return next;
}
