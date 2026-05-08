export const DEFAULT_PERSONAL_MINIMUMS = {
  ceiling_ft: 3000,
  visibility_sm: 5,
  crosswind_kt: 10,
  wind_kt: 15,
  caution_margin_pct: 20,
};

export const MANEUVER_LIST = [
  'preflight_inspection',
  'normal_takeoff',
  'crosswind_takeoff',
  'normal_landing',
  'crosswind_landing',
  'short_field_takeoff',
  'short_field_landing',
  'soft_field_takeoff',
  'soft_field_landing',
  'go_around',
  'forward_slip',
  'slow_flight',
  'power_off_stall',
  'power_on_stall',
  'steep_turns',
  'turns_around_point',
  's_turns',
  'rectangular_course',
  'emergency_descent',
  'simulated_engine_failure',
  'unusual_attitudes_recovery',
  'hood_work_basic_instruments',
];

export const GROUND_SCHOOL_TOPICS = [
  'regulations',
  'weather_theory',
  'weather_services',
  'navigation',
  'airspace',
  'performance_wb',
  'aerodynamics',
  'aircraft_systems',
  'airport_ops',
  'radio_comms',
  'cross_country_planning',
  'physiology_aeromedical',
  'night_ops_theory',
  'emergency_procedures',
  'charts_publications',
  'flight_computers',
  'sectional_reading',
  'checkride_prep',
];

function objectFromList(list, valueFactory) {
  return Object.fromEntries(list.map((item) => [item, valueFactory()]));
}

export function seedFor(store, key) {
  const seeds = {
    'logbook/entries': [],
    'expenses/entries': [],
    'training/maneuvers': objectFromList(MANEUVER_LIST, () => ({ signed_off: false, date: null, instructor: '', notes: '' })),
    'training/ground_school': objectFromList(GROUND_SCHOOL_TOPICS, () => ({
      status: 'not_started',
      last_updated: null,
      notes: '',
    })),
    'training/practice_tests': [],
    'training/written_exam': { passed: false, date: null, score: null },
    'scheduling/next_lesson': null,
    'config/personal_minimums': DEFAULT_PERSONAL_MINIMUMS,
    'config/selected_aircraft_tail': 'N53068',
  };
  return Object.prototype.hasOwnProperty.call(seeds, `${store}/${key}`) ? seeds[`${store}/${key}`] : undefined;
}
