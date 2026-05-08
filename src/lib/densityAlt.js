export function densityAltitude(elevationFt, oatC, altimeterInHg) {
  if ([elevationFt, oatC, altimeterInHg].some((value) => value == null || Number.isNaN(Number(value)))) {
    return null;
  }
  const pressureAlt = elevationFt + (29.92 - altimeterInHg) * 1000;
  const isaTemp = 15 - (2 * elevationFt) / 1000;
  return Math.round(pressureAlt + 120 * (oatC - isaTemp));
}
