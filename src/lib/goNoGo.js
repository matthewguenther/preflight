import { bestRunway } from './crosswind';

function condition(name, status, value, limit) {
  return { name, status, value, limit };
}

function nearLimit(value, limit, marginPct, direction = 'max') {
  // Caution bands are relative to personal minimums. For maximum limits,
  // "near" means close to exceeding; for minimum limits, close to dropping below.
  const margin = Math.abs(limit) * (marginPct / 100);
  return direction === 'max' ? value >= limit - margin : value <= limit + margin;
}

function text(value) {
  return String(value || '').toUpperCase();
}

function observedWeatherHazards(metar) {
  // METAR present-weather strings are terse. These token checks intentionally
  // look for aviation weather codes instead of natural-language phrases.
  const raw = text(metar.raw);
  const presentWeather = text(metar.weather || metar.wx_string || metar.wxString);
  const combined = `${presentWeather} ${raw}`;
  const hazards = [];

  if (/(?:^|\s)(?:WS|FZRA|FZDZ|SQ|FC|GR|GS|\+RA|\+SHRA|\+TSRA|\+TS)(?=\s|$)/.test(combined)) {
    hazards.push(condition('weather hazard', 'fail', 'Severe precip / wind shear', 'Avoid training flight'));
  } else if (/(?:^|\s)(?:TS|TSRA|VCTS)(?=\s|$)/.test(combined)) {
    hazards.push(condition('thunderstorm', 'fail', 'Thunderstorm reported', 'Avoid training flight'));
  }

  if (/(?:^|\s)(?:LTG|CB|TCU)(?=\s|$)/.test(combined)) {
    hazards.push(condition('convective weather', 'caution', raw.includes('LTG') ? 'Lightning reported nearby' : 'Convective clouds reported', 'Review radar / briefing'));
  }

  if (/(?:^|\s)(?:-?RA|SHRA|DZ)(?=\s|$)/.test(combined) && !/(?:^|\s)(?:\+RA|\+SHRA|\+TSRA)(?=\s|$)/.test(combined)) {
    hazards.push(condition('precipitation', 'caution', 'Rain/showers reported', 'Review radar / briefing'));
  }

  return hazards;
}

function tafHazards(taf, minimums) {
  // Only the immediate forecast window is used for training decisions so the
  // card highlights near-term deterioration rather than every TAF period.
  const periods = Array.isArray(taf?.periods) ? taf.periods : [];
  const now = Date.now();
  const lookahead = now + 3 * 60 * 60 * 1000;

  return periods
    .filter((period) => {
      const from = period.from_utc ? Date.parse(period.from_utc) : now;
      const to = period.to_utc ? Date.parse(period.to_utc) : lookahead;
      return Number.isFinite(from) && Number.isFinite(to) && from <= lookahead && to >= now;
    })
    .slice(0, 3)
    .flatMap((period) => {
      const hazards = [];
      const ceiling = period.ceiling_ft ?? 12000;
      const visibility = Number(period.visibility_sm ?? 10);
      const wind = Number(period.wind_speed_kt ?? 0);
      const weather = text(`${period.weather || ''} ${period.sky_condition || ''}`);

      if (period.flight_category && period.flight_category !== 'VFR') {
        hazards.push(condition('forecast category', 'caution', period.flight_category, 'VFR expected'));
      }
      if (ceiling < minimums.ceiling_ft || visibility < minimums.visibility_sm || wind > minimums.wind_kt) {
        hazards.push(condition('forecast trend', 'caution', 'Below personal mins within 3 hr', 'Review TAF'));
      }
      if (/(?:^|\s)(?:TS|TSRA|VCTS|CB|\+RA|SHRA|RA)(?=\s|$)/.test(weather)) {
        hazards.push(condition('forecast weather', 'caution', 'Convective/precip risk within 3 hr', 'Review TAF/radar'));
      }
      return hazards;
    });
}

export function evaluateGoNoGo(metar, minimums, tfrs = [], taf = null) {
  // Data flow: normalized METAR + saved personal minimums + nearby TFRs/TAF
  // become a status plus condition rows for the UI.
  if (!metar || !minimums) {
    return { status: 'no_go', conditions: [condition('weather', 'fail', 'Unavailable', 'Required')] };
  }

  const conditions = [];
  let status = 'go';
  const ceiling = metar.ceiling_ft ?? 12000;
  const wind = metar.wind_speed_kt ?? 0;
  const visibility = Number(metar.visibility_sm ?? 0);
  const runway = bestRunway(metar.wind_dir_deg, wind);
  const crosswind = runway?.xwind ?? 0;

  if (metar.flight_category !== 'VFR') {
    status = 'no_go';
    conditions.push(condition('flight category', 'fail', metar.flight_category || 'Unknown', 'VFR only'));
  } else {
    conditions.push(condition('flight category', 'pass', 'VFR', 'VFR only'));
  }

  const observedHazards = observedWeatherHazards(metar);
  observedHazards.forEach((item) => {
    conditions.push(item);
    if (item.status === 'fail') status = 'no_go';
    if (status !== 'no_go' && item.status === 'caution') status = 'caution';
  });

  const checks = [
    {
      name: 'ceiling',
      value: ceiling,
      fail: ceiling < minimums.ceiling_ft,
      caution: nearLimit(ceiling, minimums.ceiling_ft, minimums.caution_margin_pct, 'min'),
      display: `${metar.ceiling_ft ?? 'Unlimited'} ft`,
      limit: `${minimums.ceiling_ft}+ ft`,
    },
    {
      name: 'visibility',
      value: visibility,
      fail: visibility < minimums.visibility_sm,
      caution: nearLimit(visibility, minimums.visibility_sm, minimums.caution_margin_pct, 'min'),
      display: `${visibility} sm`,
      limit: `${minimums.visibility_sm}+ sm`,
    },
    {
      name: 'surface wind',
      value: wind,
      fail: wind > minimums.wind_kt,
      caution: nearLimit(wind, minimums.wind_kt, minimums.caution_margin_pct, 'max'),
      display: `${wind} kt`,
      limit: `${minimums.wind_kt} kt max`,
    },
    {
      name: `crosswind rwy ${runway?.id || '--'}`,
      value: crosswind,
      fail: crosswind > minimums.crosswind_kt,
      caution: nearLimit(crosswind, minimums.crosswind_kt, minimums.caution_margin_pct, 'max'),
      display: `${crosswind} kt`,
      limit: `${minimums.crosswind_kt} kt max`,
    },
  ];

  checks.forEach((check) => {
    const checkStatus = check.fail ? 'fail' : check.caution ? 'caution' : 'pass';
    conditions.push(condition(check.name, checkStatus, check.display, check.limit));
    if (check.fail) status = 'no_go';
    if (status !== 'no_go' && check.caution) status = 'caution';
  });

  const forecastHazards = tafHazards(taf, minimums);
  forecastHazards.forEach((item) => {
    conditions.push(item);
    if (status !== 'no_go') status = 'caution';
  });

  const nearbyActiveTfr = tfrs.find((tfr) => tfr.active && Number(tfr.distance_nm) <= 25);
  if (nearbyActiveTfr) {
    conditions.push(condition('nearby TFR', 'caution', `${nearbyActiveTfr.distance_nm} nm`, 'Review before flight'));
    if (status !== 'no_go') status = 'caution';
  }

  return { status, conditions };
}
