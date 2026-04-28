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

export type ComputeRoutingRole = "recommended" | "backup" | "degraded";

export type RankedComputeSatellite = {
  satellite: ComputeSatellite;
  rank: number;
  score: number;
  role: ComputeRoutingRole;
  powerMarginKw: number;
  thermalMarginKw: number;
};

export type OrbitalSchedulerUrgency = "flash" | "priority" | "standard";
export type OrbitalPassWindowTolerance = "strict" | "flex" | "hold";
export type OrbitalRoutePriority = "solar" | "latency" | "cost";

export type OrbitalSchedulerConstraints = {
  urgency: OrbitalSchedulerUrgency;
  dataVolumeTb: number;
  deadlineMinutes: number;
  passWindowTolerance: OrbitalPassWindowTolerance;
  splittable: boolean;
  compressible: boolean;
  bufferable: boolean;
  priority: OrbitalRoutePriority;
  leoNodeCount: number;
};

export type OrbitalRouteAction = "assign" | "split" | "buffer" | "compress" | "migrate" | "hold";
export type OrbitalRouteMode = "direct" | "split" | "buffered" | "compressed" | "migration" | "degraded";
export type OrbitalRouteStatus = "ready" | "backup" | "degraded" | "hold";
export type OrbitalRoutePathKind = "primary" | "backup" | "migration";

export type OrbitalRoutePathDescriptor = {
  id: string;
  kind: OrbitalRoutePathKind;
  satelliteId: string;
  groundStationId: string;
  startLat: number;
  startLng: number;
  startAlt: number;
  endLat: number;
  endLng: number;
  endAlt: number;
  distanceKm: number;
  visibilityScore: number;
  estimatedHandoffMinutes: number;
  label: string;
};

export type OrbitalRouteAssignment = {
  recommendedNode: RankedComputeSatellite;
  backupNode?: RankedComputeSatellite;
  degradedNodes: RankedComputeSatellite[];
  selectedGroundStation: GroundStation;
  backupGroundStation?: GroundStation;
  routeScore: number;
  mode: OrbitalRouteMode;
  status: OrbitalRouteStatus;
  actions: OrbitalRouteAction[];
  reasons: string[];
  riskNotes: string[];
  estimatedNextHandoffMinutes: number;
  paths: OrbitalRoutePathDescriptor[];
};

export type OrbitalRouteAssignmentInput = {
  computePoints: OrbitPoint[];
  groundStations: GroundStation[];
  rankedComputeSatellites: RankedComputeSatellite[];
  workload: OrbitalWorkload;
  constraints: OrbitalSchedulerConstraints;
  stormActive?: boolean;
};

const EARTH_RADIUS_KM = 6371;
const MINUTES_PER_DAY = 1440;
const COMPUTE_ORBIT_EPOCH_MS = Date.UTC(2026, 3, 28, 0, 0, 0);
const PUE = 1.54;
const WATER_L_PER_KWH = 1.8;
const LAUNCH_COST_PER_KG = 6000;
const MAX_NEAR_VISIBLE_DISTANCE_KM = 4_800;
const COMPUTE_HANDOFF_PERIOD_MINUTES = 94;

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function radToDeg(value: number) {
  return (value * 180) / Math.PI;
}

function wrapLng(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampPercent(value: number) {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const dLat = degToRad(b.lat - a.lat);
  const dLng = degToRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function estimateHandoffMinutes(distance: number, tolerance: OrbitalPassWindowTolerance) {
  if (distance <= 1_600) {
    return 6;
  }
  if (distance <= 2_800) {
    return 12;
  }
  if (distance <= MAX_NEAR_VISIBLE_DISTANCE_KM) {
    return 22;
  }

  const toleranceDelay = tolerance === "strict" ? 0 : tolerance === "flex" ? 12 : 28;
  return Math.min(96, Math.round(24 + ((distance - MAX_NEAR_VISIBLE_DISTANCE_KM) / 900) * 8 + toleranceDelay));
}

function stationVisibilityScore(distance: number) {
  if (distance <= 1_600) {
    return 100;
  }
  if (distance <= MAX_NEAR_VISIBLE_DISTANCE_KM) {
    return clampPercent(100 - ((distance - 1_600) / (MAX_NEAR_VISIBLE_DISTANCE_KM - 1_600)) * 42);
  }
  return clampPercent(58 - ((distance - MAX_NEAR_VISIBLE_DISTANCE_KM) / 7_000) * 58);
}

function pointForRankedNode(computePoints: OrbitPoint[], ranked: RankedComputeSatellite) {
  return computePoints.find((point) => point.id === ranked.satellite.id && point.kind === "compute");
}

function rankGroundStationsForNode(
  point: OrbitPoint,
  stations: GroundStation[],
  constraints: OrbitalSchedulerConstraints,
) {
  return stations
    .map((station) => {
      const distance = distanceKm(point, station);
      const visibilityScore = stationVisibilityScore(distance);
      const estimatedHandoffMinutes = estimateHandoffMinutes(distance, constraints.passWindowTolerance);
      const deadlineFit = estimatedHandoffMinutes <= constraints.deadlineMinutes ? 18 : -18;
      const latencyWeight = constraints.priority === "latency" || constraints.urgency === "flash" ? 1.2 : 0.75;
      const bandwidthWeight = constraints.priority === "cost" ? 7 : 10;
      const score =
        visibilityScore * latencyWeight +
        station.bandwidthGbps * bandwidthWeight +
        deadlineFit -
        Math.max(0, estimatedHandoffMinutes - constraints.deadlineMinutes) * 0.8;

      return {
        station,
        distance,
        visibilityScore,
        estimatedHandoffMinutes,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || a.estimatedHandoffMinutes - b.estimatedHandoffMinutes || b.station.bandwidthGbps - a.station.bandwidthGbps);
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
  const elapsedMinutes = (date.getTime() - COMPUTE_ORBIT_EPOCH_MS) / 60000;
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

export function rankComputeSatellitesForWorkload(
  satellites: ComputeSatellite[],
  workload: OrbitalWorkload,
): RankedComputeSatellite[] {
  const scored = satellites.map((satellite) => {
    const health = satellite.health;
    const powerMarginKw = satellite.powerKw - workload.requiredPowerKw;
    const thermalMarginKw = satellite.thermalCapacityKw - workload.requiredPowerKw;
    const powerFit = clamp01((powerMarginKw + 8) / 18);
    const thermalFit = clamp01((thermalMarginKw + health.thermalMarginKw + 4) / 18);
    const healthScore =
      health.batteryPercent * 0.09 +
      health.powerStatePercent * 0.08 +
      health.computeHeadroomPercent * 0.13 +
      (100 - health.computeLoadPercent) * 0.08 +
      (100 - health.queueLoadPercent) * 0.12 +
      (100 - health.radiationRiskPercent) * 0.12 +
      health.linkQualityPercent * 0.13 +
      (100 - health.thermalLoadPercent) * 0.08 +
      satellite.sunlightPercent * 0.07 +
      powerFit * 10 +
      thermalFit * 10;
    const latencyBonus = workload.latencySensitive && health.linkReady ? 4 : 0;
    const linkPenalty = health.linkReady ? 0 : 16;
    const capacityPenalty = powerMarginKw < -8 || thermalMarginKw < -8 ? 18 : powerMarginKw < 0 || thermalMarginKw < 0 ? 7 : 0;
    const score = Math.round(Math.max(0, Math.min(100, healthScore + latencyBonus - linkPenalty - capacityPenalty)));

    return {
      satellite,
      score,
      powerMarginKw,
      thermalMarginKw,
      degraded:
        !health.linkReady ||
        health.radiationRiskPercent >= 30 ||
        health.queueLoadPercent >= 75 ||
        health.thermalLoadPercent >= 88 ||
        powerMarginKw < -8 ||
        thermalMarginKw < -8,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.powerMarginKw - a.powerMarginKw || a.satellite.name.localeCompare(b.satellite.name))
    .map((item, index) => ({
      satellite: item.satellite,
      rank: index + 1,
      score: item.score,
      role: item.degraded ? "degraded" : index === 0 ? "recommended" : "backup",
      powerMarginKw: item.powerMarginKw,
      thermalMarginKw: item.thermalMarginKw,
    }));
}

export function buildOrbitalRouteAssignment({
  computePoints,
  groundStations: stations,
  rankedComputeSatellites,
  workload,
  constraints,
  stormActive = false,
}: OrbitalRouteAssignmentInput): OrbitalRouteAssignment | null {
  const candidates = rankedComputeSatellites.flatMap((ranked) => {
    const point = pointForRankedNode(computePoints, ranked);
    if (!point) {
      return [];
    }

    const stationOptions = rankGroundStationsForNode(point, stations, constraints);
    const primaryStation = stationOptions[0];
    if (!primaryStation) {
      return [];
    }

    const stormPenalty = stormActive && ranked.satellite.id === "compute-b" ? 34 : 0;
    const stormTakeoverBonus = stormActive && ranked.satellite.id === "compute-a" ? 8 : 0;
    const deadlinePenalty = Math.max(0, primaryStation.estimatedHandoffMinutes - constraints.deadlineMinutes) * 0.65;
    const priorityBonus =
      constraints.priority === "solar"
        ? ranked.satellite.sunlightPercent * 0.06
        : constraints.priority === "latency"
          ? primaryStation.visibilityScore * 0.08
          : Math.max(0, 12 - ranked.rank * 3);
    const workloadFitPenalty =
      ranked.powerMarginKw < 0 && !constraints.splittable
        ? 12
        : ranked.powerMarginKw < 0 && constraints.splittable
          ? 4
          : 0;
    const score = clampPercent(
      ranked.score * 0.68 +
        primaryStation.visibilityScore * 0.22 +
        primaryStation.station.bandwidthGbps * 2.4 +
        priorityBonus +
        stormTakeoverBonus -
        stormPenalty -
        deadlinePenalty -
        workloadFitPenalty,
    );
    const degraded =
      ranked.role === "degraded" ||
      stormPenalty > 0 ||
      primaryStation.estimatedHandoffMinutes > constraints.deadlineMinutes + (constraints.bufferable ? 30 : 8);

    return [
      {
        ranked,
        point,
        stationOptions,
        score,
        degraded,
      },
    ];
  });

  if (candidates.length === 0) {
    return null;
  }

  const sortedCandidates = candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.degraded) - Number(b.degraded) ||
      a.stationOptions[0].estimatedHandoffMinutes - b.stationOptions[0].estimatedHandoffMinutes ||
      a.ranked.rank - b.ranked.rank,
  );
  const selected = sortedCandidates[0];
  const backup = sortedCandidates.find((candidate) => candidate.ranked.satellite.id !== selected.ranked.satellite.id);
  const selectedStation = selected.stationOptions[0];
  const backupStation = selected.stationOptions.find((option) => option.station.id !== selectedStation.station.id) ?? backup?.stationOptions[0];
  const degradedNodes = rankedComputeSatellites.filter(
    (ranked) =>
      ranked.role === "degraded" ||
      (stormActive && ranked.satellite.id === "compute-b") ||
      sortedCandidates.find((candidate) => candidate.ranked.satellite.id === ranked.satellite.id)?.degraded,
  );
  const estimatedNextHandoffMinutes = Math.min(
    COMPUTE_HANDOFF_PERIOD_MINUTES,
    selectedStation.estimatedHandoffMinutes,
    backupStation?.estimatedHandoffMinutes ?? COMPUTE_HANDOFF_PERIOD_MINUTES,
  );
  const actions: OrbitalRouteAction[] = ["assign"];

  if (constraints.compressible && (constraints.deadlineMinutes <= 45 || constraints.dataVolumeTb >= 35)) {
    actions.push("compress");
  }
  if (constraints.splittable && (workload.requiredPowerKw > selected.ranked.satellite.powerKw || constraints.dataVolumeTb >= 50)) {
    actions.push("split");
  }
  if (constraints.bufferable && selectedStation.estimatedHandoffMinutes > constraints.deadlineMinutes) {
    actions.push("buffer");
  }
  if (stormActive && selected.ranked.satellite.id === "compute-a") {
    actions.push("migrate");
  }
  if (!constraints.bufferable && selectedStation.estimatedHandoffMinutes > constraints.deadlineMinutes && constraints.passWindowTolerance === "hold") {
    actions.push("hold");
  }

  const status: OrbitalRouteStatus =
    selected.degraded || selected.score < 48
      ? "degraded"
      : selectedStation.estimatedHandoffMinutes > constraints.deadlineMinutes && constraints.bufferable
        ? "hold"
        : selected.score < 66
          ? "backup"
          : "ready";
  const mode: OrbitalRouteMode =
    status === "degraded"
      ? "degraded"
      : actions.includes("migrate")
        ? "migration"
        : actions.includes("split")
          ? "split"
          : actions.includes("buffer")
            ? "buffered"
            : actions.includes("compress")
              ? "compressed"
              : "direct";
  const reasons = [
    `${selected.ranked.satellite.name} has the strongest combined health, capacity, and pass score for ${workload.name}.`,
    `${selectedStation.station.city} is the preferred downlink with ${selectedStation.visibilityScore}% modeled visibility and ${selectedStation.station.bandwidthGbps.toFixed(1)} Gbps capacity.`,
    `${estimatedNextHandoffMinutes} minute estimated next handoff fits the ${constraints.deadlineMinutes} minute scheduler target${
      estimatedNextHandoffMinutes <= constraints.deadlineMinutes ? "" : " only with buffering or pass tolerance"
    }.`,
  ];
  const riskNotes = [
    ...(selectedStation.estimatedHandoffMinutes > constraints.deadlineMinutes
      ? [`Primary pass estimate exceeds deadline by ${selectedStation.estimatedHandoffMinutes - constraints.deadlineMinutes} minutes.`]
      : []),
    ...(degradedNodes.length > 0
      ? [`Degraded nodes: ${degradedNodes.map((node) => node.satellite.name).join(", ")}.`]
      : []),
    ...(stormActive ? ["Storm mode penalizes Photonix Dawn-2 and favors Dawn-1 takeover."] : []),
    ...(selected.ranked.powerMarginKw < 0 ? [`Selected node is ${Math.abs(selected.ranked.powerMarginKw)} kW below single-node workload power target.`] : []),
  ];

  const makePath = (
    kind: OrbitalRoutePathKind,
    candidate: typeof selected,
    stationOption: (typeof selected.stationOptions)[number],
  ): OrbitalRoutePathDescriptor => ({
    id: `${kind}-${candidate.ranked.satellite.id}-${stationOption.station.id}`,
    kind,
    satelliteId: candidate.ranked.satellite.id,
    groundStationId: stationOption.station.id,
    startLat: candidate.point.lat,
    startLng: candidate.point.lng,
    startAlt: candidate.point.altitude,
    endLat: stationOption.station.lat,
    endLng: stationOption.station.lng,
    endAlt: 0.012,
    distanceKm: Math.round(stationOption.distance),
    visibilityScore: stationOption.visibilityScore,
    estimatedHandoffMinutes: stationOption.estimatedHandoffMinutes,
    label: `${candidate.ranked.satellite.name} to ${stationOption.station.city}: ${stationOption.estimatedHandoffMinutes} min / ${stationOption.visibilityScore}% visibility`,
  });
  const paths = [
    makePath("primary", selected, selectedStation),
    ...(backup ? [makePath("backup", backup, backup.stationOptions[0])] : []),
    ...(stormActive && selected.ranked.satellite.id === "compute-a"
      ? sortedCandidates
          .filter((candidate) => candidate.ranked.satellite.id === "compute-b")
          .slice(0, 1)
          .map((candidate) => makePath("migration", candidate, candidate.stationOptions[0]))
      : []),
  ];

  return {
    recommendedNode: selected.ranked,
    backupNode: backup?.ranked,
    degradedNodes,
    selectedGroundStation: selectedStation.station,
    backupGroundStation: backupStation?.station,
    routeScore: selected.score,
    mode,
    status,
    actions: Array.from(new Set(actions)),
    reasons,
    riskNotes,
    estimatedNextHandoffMinutes,
    paths,
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
  stormActive = false,
): DownlinkArc[] {
  if (!active) {
    return [];
  }

  const targetStations = stations.filter((station) => ["riyadh", "dubai", "abudhabi"].includes(station.id));
  return computePoints.slice(0, 2).flatMap((point, index) =>
    targetStations.slice(0, index === 0 ? 3 : 2).map((station) => {
      const degraded = stormActive && point.id === "compute-b";
      return {
        id: `${point.id}-${station.id}`,
        satelliteId: point.id,
        groundStationId: station.id,
        startLat: point.lat,
        startLng: point.lng,
        startAlt: point.altitude,
        endLat: station.lat,
        endLng: station.lng,
        endAlt: 0.012,
        color: degraded
          ? ["rgba(239, 68, 68, 0.92)", "rgba(245, 184, 75, 0.84)"]
          : ["rgba(245, 184, 75, 0.92)", "rgba(52, 211, 153, 0.92)"],
        label: `${point.name} to ${station.city}: ${
          degraded ? "degraded storm path" : `${station.bandwidthGbps.toFixed(1)} Gbps`
        }`,
      };
    }),
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
  const selected = satellites.slice(0, workload.id === "training" || workload.id === "auto" ? 3 : 2);
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
