import * as satellite from "satellite.js";
import type { ComputeSatellite, GroundStation, OrbitalWorkload, TrackedTle } from "../types";

export type OrbitPointKind = "starlink" | "compute" | "ground";

export type OrbitPoint = {
  id: string;
  name: string;
  kind: OrbitPointKind;
  lat: number;
  lng: number;
  altitude: number;
  color: string;
  radius: number;
  city?: string;
  bandwidthGbps?: number;
  satellite?: ComputeSatellite;
};

export type DownlinkArc = {
  id: string;
  satelliteId: string;
  groundStationId: string;
  startLat: number;
  startLng: number;
  startAlt: number;
  endLat: number;
  endLng: number;
  endAlt: number;
  color: string[];
  label: string;
};

export type CostComparison = {
  orbitalPowerKw: number;
  orbitalMonthlyCost: number;
  orbitalUptime: number;
  terrestrialMw: number;
  terrestrialWaterLitersDay: number;
  terrestrialMonthlyCost: number;
  carbonSavingsKgDay: number;
};

const EARTH_RADIUS_KM = 6371;
const MINUTES_PER_DAY = 1440;
const PUE = 1.54;
const WATER_L_PER_KWH = 1.8;
const LAUNCH_COST_PER_KG = 6000;

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function radToDeg(value: number) {
  return (value * 180) / Math.PI;
}

function wrapLng(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

export function createTrackedSatellites(tles: TrackedTle[]) {
  return tles.map((tle) => ({
    ...tle,
    satrec: satellite.twoline2satrec(tle.tle1, tle.tle2),
  }));
}

export function propagateTrackedSatellites(
  tracked: ReturnType<typeof createTrackedSatellites>,
  date: Date,
): OrbitPoint[] {
  const gmst = satellite.gstime(date);

  return tracked.flatMap((item) => {
    const propagated = satellite.propagate(item.satrec, date);
    if (!propagated.position || typeof propagated.position === "boolean") {
      return [];
    }

    const geodetic = satellite.eciToGeodetic(propagated.position, gmst);
    return [
      {
        id: item.id,
        name: item.name,
        kind: "starlink" as const,
        lat: satellite.degreesLat(geodetic.latitude),
        lng: satellite.degreesLong(geodetic.longitude),
        altitude: Math.max(0.055, geodetic.height / EARTH_RADIUS_KM),
        color: "rgba(96, 165, 250, 0.78)",
        radius: 0.105,
      },
    ];
  });
}

export function projectComputeSatellite(sat: ComputeSatellite, date: Date): OrbitPoint {
  const elapsedMinutes = date.getTime() / 60000;
  const orbitPeriodMinutes = 94 + (sat.altitudeKm - 550) / 18;
  const phase = degToRad((sat.phaseDeg + (elapsedMinutes / orbitPeriodMinutes) * 360) % 360);
  const inclination = degToRad(sat.inclinationDeg);
  const lat = radToDeg(Math.asin(Math.sin(inclination) * Math.sin(phase)));
  const lngDrift = (elapsedMinutes / MINUTES_PER_DAY) * 360;
  const lng = wrapLng(sat.raanDeg + radToDeg(Math.atan2(Math.cos(inclination) * Math.sin(phase), Math.cos(phase))) - lngDrift);

  return {
    id: sat.id,
    name: sat.name,
    kind: "compute",
    lat,
    lng,
    altitude: sat.altitudeKm / EARTH_RADIUS_KM,
    color: "#f5b84b",
    radius: 0.42,
    satellite: sat,
  };
}

export function groundStationPoints(stations: GroundStation[]): OrbitPoint[] {
  return stations.map((station) => ({
    id: station.id,
    name: station.name,
    kind: "ground" as const,
    lat: station.lat,
    lng: station.lng,
    altitude: 0.015,
    color: "#34d399",
    radius: 0.34,
    city: station.city,
    bandwidthGbps: station.bandwidthGbps,
  }));
}

export function buildDownlinkArcs(
  computePoints: OrbitPoint[],
  stations: GroundStation[],
  active: boolean,
): DownlinkArc[] {
  if (!active) {
    return [];
  }

  const targetStations = stations.filter((station) => ["riyadh", "dubai", "abudhabi"].includes(station.id));
  return computePoints.slice(0, 2).flatMap((point, index) =>
    targetStations.slice(0, index === 0 ? 3 : 2).map((station) => ({
      id: `${point.id}-${station.id}`,
      satelliteId: point.id,
      groundStationId: station.id,
      startLat: point.lat,
      startLng: point.lng,
      startAlt: point.altitude,
      endLat: station.lat,
      endLng: station.lng,
      endAlt: 0.012,
      color: ["rgba(245, 184, 75, 0.92)", "rgba(52, 211, 153, 0.92)"],
      label: `${point.name} to ${station.city}: ${station.bandwidthGbps.toFixed(1)} Gbps`,
    })),
  );
}

export function buildSunSyncPath() {
  const inclination = degToRad(97.6);
  return Array.from({ length: 181 }, (_, index) => {
    const phase = degToRad(index * 2);
    return {
      lat: radToDeg(Math.asin(Math.sin(inclination) * Math.sin(phase))),
      lng: wrapLng(radToDeg(phase) - 180),
      alt: 0.115,
    };
  });
}

export function compareOrbitalToTerrestrial(
  satellites: ComputeSatellite[],
  workload: OrbitalWorkload,
): CostComparison {
  const selected = satellites.slice(0, workload.id === "training" ? 3 : 2);
  const orbitalPowerKw = selected.reduce((sum, sat) => sum + sat.powerKw, 0);
  const massKg = selected.reduce((sum, sat) => sum + sat.massKg, 0);
  const orbitalUptime =
    selected.reduce((sum, sat) => sum + sat.sunlightPercent, 0) / Math.max(selected.length, 1);
  const terrestrialKw = Math.max(workload.requiredPowerKw * 640, orbitalPowerKw * 420);
  const terrestrialMw = (terrestrialKw * PUE) / 1000;
  const terrestrialWaterLitersDay = terrestrialKw * 24 * WATER_L_PER_KWH;
  const terrestrialMonthlyCost = terrestrialKw * 24 * 30 * 0.19;
  const orbitalMonthlyCost = (massKg * LAUNCH_COST_PER_KG) / 60 + orbitalPowerKw * 24 * 30 * 0.025;
  const carbonSavingsKgDay = terrestrialKw * 24 * 0.38;

  return {
    orbitalPowerKw,
    orbitalMonthlyCost,
    orbitalUptime,
    terrestrialMw,
    terrestrialWaterLitersDay,
    terrestrialMonthlyCost,
    carbonSavingsKgDay,
  };
}

export function missionPlannerResponse(workload: OrbitalWorkload, activeCompute: ComputeSatellite[]) {
  const power = activeCompute.slice(0, 2).reduce((sum, sat) => sum + sat.powerKw, 0);
  const uptime = Math.round(activeCompute.slice(0, 2).reduce((sum, sat) => sum + sat.sunlightPercent, 0) / 2);
  const downlink = workload.latencySensitive ? "every 14-18 minutes" : "every 44-52 minutes";
  const cost = workload.id === "training" ? "$8.7M vs $31M" : "$4.2M vs $18M";

  return `Place Dawn-1 and Dawn-2 in a 550 km dawn-dusk sun-synchronous orbit at 97.6 degrees inclination. This gives ${uptime}% modeled solar uptime, ${power} kW of orbital compute power, and Riyadh/Dubai downlink windows ${downlink}. Five-year estimate for ${workload.name}: ${cost} versus ground infrastructure. Recommended Action: deploy the highlighted slot and reserve Riyadh plus Dubai as primary downlink sites.`;
}
