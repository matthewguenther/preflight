import { FLEET, MANEUVER_LIST } from './constants';
import { todayLocalISO } from './time';

const round1 = (value) => Math.round(Number(value) * 10) / 10;
const round2 = (value) => Math.round(Number(value) * 100) / 100;

export function validateLogbook(entry) {
  const errors = {};
  const hobbsTotal = round1(Number(entry.hobbs_end) - Number(entry.hobbs_start));
  if (!entry.date) errors.date = 'Required';
  if (entry.date > todayLocalISO()) errors.date = 'Date cannot be in the future';
  if (entry.date < '2024-01-01') errors.date = 'Date is before the sanity floor';
  if (!FLEET.some((aircraft) => aircraft.tail === entry.aircraft_tail)) errors.aircraft_tail = 'Unknown tail';
  if (!(Number(entry.hobbs_end) > Number(entry.hobbs_start))) errors.hobbs_end = 'Must be greater than start';
  if (round1(entry.hobbs_total) !== hobbsTotal) errors.hobbs_total = 'Hobbs total does not match start/end';
  ['landings_day', 'landings_night'].forEach((field) => {
    if (!Number.isInteger(Number(entry[field])) || Number(entry[field]) < 0) errors[field] = 'Must be a non-negative integer';
  });
  ['night_hours', 'instrument_hours', 'xc_hours'].forEach((field) => {
    if (Number(entry[field] || 0) > Number(entry.hobbs_total || 0)) errors[field] = 'Cannot exceed Hobbs total';
  });
  if (Number(entry.xc_hours || 0) > 0) {
    if (entry.destination_airport === entry.departure_airport) errors.destination_airport = 'Required for cross-country';
    if (Number(entry.xc_distance_nm || 0) < 50) errors.xc_distance_nm = 'Must be at least 50 NM';
  }
  if ((entry.maneuvers_practiced || []).some((item) => !MANEUVER_LIST.includes(item))) {
    errors.maneuvers_practiced = 'Contains an unknown maneuver';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function normalizeLogbook(entry) {
  return {
    ...entry,
    hobbs_start: Number(entry.hobbs_start || 0),
    hobbs_end: Number(entry.hobbs_end || 0),
    hobbs_total: round1(Number(entry.hobbs_end || 0) - Number(entry.hobbs_start || 0)),
    landings_day: Number(entry.landings_day || 0),
    landings_night: Number(entry.landings_night || 0),
    night_hours: Number(entry.night_hours || 0),
    instrument_hours: Number(entry.instrument_hours || 0),
    xc_hours: Number(entry.xc_hours || 0),
    xc_distance_nm: Number(entry.xc_distance_nm || 0),
  };
}

export function validateExpense(entry, logbookEntries = []) {
  const errors = {};
  if (!entry.date) errors.date = 'Required';
  if (entry.date > todayLocalISO()) errors.date = 'Date cannot be in the future';
  ['aircraft_cost', 'instructor_cost', 'fees', 'fuel_cost'].forEach((field) => {
    if (Number(entry[field] || 0) < 0) errors[field] = 'Must be non-negative';
  });
  const expected = round2(
    Number(entry.aircraft_cost || 0) + Number(entry.instructor_cost || 0) + Number(entry.fees || 0) + Number(entry.fuel_cost || 0),
  );
  if (round2(entry.total || 0) !== expected) errors.total = 'Total does not match line items';
  if (entry.logbook_entry_id && !logbookEntries.some((log) => log.id === entry.logbook_entry_id)) {
    errors.logbook_entry_id = 'Logbook entry not found';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function normalizeExpense(entry) {
  const aircraft_cost = Number(entry.aircraft_cost || 0);
  const instructor_cost = Number(entry.instructor_cost || 0);
  const fees = Number(entry.fees || 0);
  const fuel_cost = Number(entry.fuel_cost || 0);
  return {
    ...entry,
    hobbs_hours: Number(entry.hobbs_hours || 0),
    aircraft_cost,
    instructor_cost,
    fees,
    fuel_cost,
    total: round2(aircraft_cost + instructor_cost + fees + fuel_cost),
  };
}

export function validatePersonalMinimums(minimums) {
  const errors = {};
  const ranges = {
    ceiling_ft: [1000, 10000],
    visibility_sm: [1, 10],
    crosswind_kt: [0, 25],
    wind_kt: [0, 40],
    caution_margin_pct: [0, 50],
  };
  Object.entries(ranges).forEach(([field, [min, max]]) => {
    const value = Number(minimums[field]);
    if (Number.isNaN(value) || value < min || value > max) errors[field] = `Must be ${min}-${max}`;
  });
  return { valid: Object.keys(errors).length === 0, errors };
}
