import type { DemandPoint, Satellite, SatelliteType } from "../types";

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function isPointCovered(
  point: DemandPoint,
  satellite: Satellite,
  satelliteType: SatelliteType,
) {
  return satellite.enabled && haversineKm(point, satellite) <= satelliteType.radiusKm;
}

export function centroid(points: DemandPoint[]) {
  if (points.length === 0) {
    return { lat: 24.1, lng: 45.2 };
  }

  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
  };
}

export function spreadScore(satellites: Satellite[]) {
  if (satellites.length < 2) {
    return 0.5;
  }

  let total = 0;
  let pairs = 0;
  for (let i = 0; i < satellites.length; i += 1) {
    for (let j = i + 1; j < satellites.length; j += 1) {
      total += Math.min(haversineKm(satellites[i], satellites[j]) / 900, 1);
      pairs += 1;
    }
  }

  return pairs ? total / pairs : 0;
}
