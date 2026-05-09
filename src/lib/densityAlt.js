export function densityAltitude(elevationFt, oatC, altimeterInHg) {
  // Approximation for briefing display only: pressure altitude plus 120 ft per
  // degree C above ISA. Null inputs stay null so cards can show "--".
  if ([elevationFt, oatC, altimeterInHg].some((value) => value == null || Number.isNaN(Number(value)))) {
    return null;
  }
  const pressureAlt = elevationFt + (29.92 - altimeterInHg) * 1000;
  const isaTemp = 15 - (2 * elevationFt) / 1000;
  return Math.round(pressureAlt + 120 * (oatC - isaTemp));
}
