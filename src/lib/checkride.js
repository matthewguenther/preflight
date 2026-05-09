import { GROUND_SCHOOL_TOPICS, MANEUVER_LIST } from './constants';

function sum(entries, predicate, field = 'hobbs_total') {
  return entries.filter(predicate).reduce((total, entry) => total + Number(entry[field] || 0), 0);
}

function progress(label, current, required, weight, complete = Math.min(current / required, 1)) {
  // Each readiness component contributes a weighted fraction to the final score.
  // The weights are product choices, not regulatory math.
  return {
    label,
    current,
    required,
    weight,
    complete: Number.isFinite(complete) ? Math.max(0, Math.min(complete, 1)) : 0,
  };
}

export function aggregateHours(entries = []) {
  // One pass of logbook rollups used by multiple panels: readiness, expenses,
  // and logbook progress bars all depend on these derived totals.
  return {
    total: sum(entries, () => true),
    dual: sum(entries, (entry) => entry.type === 'dual'),
    solo: sum(entries, (entry) => entry.type === 'solo'),
    soloXc: sum(entries, (entry) => entry.type === 'solo' && Number(entry.xc_hours) > 0, 'xc_hours'),
    night: sum(entries, () => true, 'night_hours'),
    instrument: sum(entries, () => true, 'instrument_hours'),
    dualXc: sum(entries, (entry) => entry.type === 'dual' && Number(entry.xc_hours) > 0, 'xc_hours'),
    nightLandings: entries.reduce((total, entry) => total + Number(entry.landings_night || 0), 0),
    soloFullStopLandings: entries
      .filter((entry) => entry.type === 'solo')
      .reduce((total, entry) => total + Number(entry.landings_day || 0) + Number(entry.landings_night || 0), 0),
  };
}

export function computeReadiness({ entries = [], maneuvers = {}, groundSchool = {}, writtenExam = {} }) {
  // Combines logbook totals, instructor signoffs, ground school, and written
  // exam state into a single "how close are we" dashboard score.
  const hours = aggregateHours(entries);
  const signed = Object.values(maneuvers).filter((item) => item?.signed_off).length;
  const completeTopics = Object.values(groundSchool).filter((item) => item?.status === 'complete').length;
  const longSoloXc = entries.some((entry) => entry.type === 'solo' && Number(entry.xc_distance_nm) >= 150) ? 1 : 0;
  const nightXc = entries.some((entry) => Number(entry.night_hours) > 0 && Number(entry.xc_distance_nm) >= 100) ? 1 : 0;

  const components = [
    progress('Total hours', hours.total, 40, 0.2),
    progress('Solo hours', hours.solo, 10, 0.1),
    progress('Solo XC hours', hours.soloXc, 5, 0.08),
    progress('Long solo XC', longSoloXc, 1, 0.05),
    progress('Night hours', hours.night, 3, 0.08),
    progress('Night XC', nightXc, 1, 0.04),
    progress('Night takeoffs and landings', hours.nightLandings, 10, 0.05),
    progress('Instrument hours', hours.instrument, 3, 0.05),
    progress('Maneuvers signed off', signed, MANEUVER_LIST.length, 0.15),
    progress('Ground school complete', completeTopics, GROUND_SCHOOL_TOPICS.length, 0.12),
    progress('Written exam', writtenExam?.passed ? 1 : 0, 1, 0.08),
  ];

  const score = Math.round(components.reduce((total, item) => total + item.complete * item.weight, 0) * 100);
  return { score, components, hours, remaining: components.filter((item) => item.complete < 1) };
}

export function projectedTotalCost(expenses = [], currentTotalHours, targetHours = 40) {
  // Projection assumes the observed average cost/hour continues through the
  // target hour count. Confidence is based only on sample size.
  const totalSpent = expenses.reduce((sum, expense) => sum + Number(expense.total || 0), 0);
  if (currentTotalHours <= 0) return { projected: 0, remaining: 0, cost_per_hour: 0, confidence: 'low' };
  const costPerHour = totalSpent / currentTotalHours;
  const hoursRemaining = Math.max(0, targetHours - currentTotalHours);
  const projected = totalSpent + costPerHour * hoursRemaining;
  return {
    projected: Math.round(projected),
    remaining: Math.round(projected - totalSpent),
    cost_per_hour: Math.round(costPerHour),
    confidence: currentTotalHours < 5 ? 'low' : currentTotalHours < 15 ? 'medium' : 'high',
  };
}
