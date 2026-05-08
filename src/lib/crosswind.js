import { AIRPORT } from './constants';

export function crosswindComponent(windDirDeg, windSpeedKt, runwayHeadingDeg) {
  if (windDirDeg == null || Number.isNaN(Number(windDirDeg))) return 0;
  const angleDeg = Math.abs(Number(windDirDeg) - runwayHeadingDeg);
  const wrappedAngle = angleDeg > 180 ? 360 - angleDeg : angleDeg;
  const angleRad = (wrappedAngle * Math.PI) / 180;
  return Math.round(Number(windSpeedKt || 0) * Math.sin(angleRad) * 10) / 10;
}

export function bestRunway(windDirDeg, windSpeedKt) {
  return AIRPORT.runways
    .map((runway) => ({
      ...runway,
      xwind: crosswindComponent(windDirDeg, windSpeedKt, runway.heading_deg),
    }))
    .sort((a, b) => Math.abs(a.xwind) - Math.abs(b.xwind))[0];
}
