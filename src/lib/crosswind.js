import { AIRPORT } from './constants';

export function windComponents(windDirDeg, windSpeedKt, runwayHeadingDeg) {
  // Wind direction is where the wind is coming from. Cosine gives the component
  // along the runway centerline; positive is headwind, negative is tailwind.
  if (windDirDeg == null || Number.isNaN(Number(windDirDeg)) || runwayHeadingDeg == null) {
    return { headwind: 0, crosswind: 0 };
  }
  const angleDeg = Math.abs(Number(windDirDeg) - runwayHeadingDeg);
  const wrappedAngle = angleDeg > 180 ? 360 - angleDeg : angleDeg;
  const angleRad = (wrappedAngle * Math.PI) / 180;
  const speed = Number(windSpeedKt || 0);

  return {
    headwind: Math.round(speed * Math.cos(angleRad) * 10) / 10,
    crosswind: Math.round(Math.abs(speed * Math.sin(angleRad)) * 10) / 10,
  };
}

export function crosswindComponent(windDirDeg, windSpeedKt, runwayHeadingDeg) {
  return windComponents(windDirDeg, windSpeedKt, runwayHeadingDeg).crosswind;
}

export function bestRunway(windDirDeg, windSpeedKt) {
  // Used by go/no-go checks that still rely on the local constants airport.
  // Sort by strongest headwind first, then smallest crosswind.
  return AIRPORT.runways
    .map((runway) => ({
      ...runway,
      ...windComponents(windDirDeg, windSpeedKt, runway.heading_deg),
    }))
    .map((runway) => ({ ...runway, xwind: runway.crosswind }))
    .sort((a, b) => b.headwind - a.headwind || a.crosswind - b.crosswind)[0];
}
