import { bestRunway } from './crosswind';

function condition(name, status, value, limit) {
  return { name, status, value, limit };
}

function nearLimit(value, limit, marginPct, direction = 'max') {
  const margin = Math.abs(limit) * (marginPct / 100);
  return direction === 'max' ? value >= limit - margin : value <= limit + margin;
}

export function evaluateGoNoGo(metar, minimums, tfrs = []) {
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

  const nearbyActiveTfr = tfrs.find((tfr) => tfr.active && Number(tfr.distance_nm) <= 25);
  if (nearbyActiveTfr) {
    conditions.push(condition('nearby TFR', 'caution', `${nearbyActiveTfr.distance_nm} nm`, 'Review before flight'));
    if (status !== 'no_go') status = 'caution';
  }

  return { status, conditions };
}
