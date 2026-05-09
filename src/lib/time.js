import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const LOCAL_TZ = 'America/Chicago';

// Keep all pilot-facing dates in one timezone so saved lessons/logbook entries
// do not drift based on the browser or serverless runtime locale.
export function toUTC(localDate) {
  return new Date(localDate).toISOString();
}

export function formatLocal(utcIso, fmt = 'MMM d, yyyy h:mm a') {
  if (!utcIso) return 'Not set';
  return formatInTimeZone(parseISO(utcIso), LOCAL_TZ, fmt);
}

export function formatZulu(utcIso, fmt = 'HHmm') {
  if (!utcIso) return '--';
  return `${format(parseISO(utcIso), fmt)}Z`;
}

export function todayLocalISO() {
  return formatInTimeZone(new Date(), LOCAL_TZ, 'yyyy-MM-dd');
}

export function isOlderThan(utcIso, ms) {
  if (!utcIso) return true;
  return Date.now() - new Date(utcIso).getTime() > ms;
}
