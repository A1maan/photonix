import type {
  CoverageAnalysis,
  DemandPoint,
  MissionGoal,
  PlanningConstraints,
  Priority,
  Satellite,
  SatelliteType,
} from "../types";
import { isPointCovered } from "./geo";

const priorityWeight: Record<Priority, number> = {
  low: 0.75,
  medium: 1,
  high: 1.35,
  critical: 1.8,
};

const missionCategoryBoost: Record<MissionGoal, Partial<Record<DemandPoint["category"], number>>> = {
  rural_broadband: { rural: 1.45, school: 1.15, clinic: 1.1 },
  disaster_response: { emergency: 1.7, logistics: 1.3, clinic: 1.25 },
  schools_clinics: { school: 1.65, clinic: 1.65 },
  minimum_cost: { rural: 1.1, logistics: 1.05 },
  emergency_backup: { emergency: 1.45, clinic: 1.25, logistics: 1.2 },
};

export function getSatelliteType(typeId: string, satelliteTypes: SatelliteType[]) {
  const type = satelliteTypes.find((item) => item.id === typeId);
  if (!type) {
    throw new Error(`Unknown satellite type: ${typeId}`);
  }
  return type;
}

export function demandWeight(point: DemandPoint, missionGoal: MissionGoal) {
  const categoryBoost = missionCategoryBoost[missionGoal][point.category] ?? 1;
  return point.populationWeight * priorityWeight[point.priority] * categoryBoost;
}

export function calculateTotalCost(satellites: Satellite[], satelliteTypes: SatelliteType[]) {
  return satellites
    .filter((satellite) => satellite.enabled)
    .reduce((sum, satellite) => sum + getSatelliteType(satellite.typeId, satelliteTypes).cost, 0);
}

export function analyzeCoverage(
  satellites: Satellite[],
  demandPoints: DemandPoint[],
  satelliteTypes: SatelliteType[],
  constraints: PlanningConstraints,
): CoverageAnalysis {
  const enabledSatellites = satellites.filter((satellite) => satellite.enabled);
  const totalCost = calculateTotalCost(enabledSatellites, satelliteTypes);
  const coveredPoints: DemandPoint[] = [];
  const uncoveredPoints: DemandPoint[] = [];

  for (const point of demandPoints) {
    const covered = enabledSatellites.some((satellite) =>
      isPointCovered(point, satellite, getSatelliteType(satellite.typeId, satelliteTypes)),
    );
    if (covered) {
      coveredPoints.push(point);
    } else {
      uncoveredPoints.push(point);
    }
  }

  const totalWeightedDemand = demandPoints.reduce(
    (sum, point) => sum + demandWeight(point, constraints.missionGoal),
    0,
  );
  const coveredWeightedDemand = coveredPoints.reduce(
    (sum, point) => sum + demandWeight(point, constraints.missionGoal),
    0,
  );
  const budgetRemaining = constraints.budget - totalCost;
  const warnings: string[] = [];

  if (enabledSatellites.length > constraints.maxSatellites) {
    warnings.push(`Satellite limit exceeded by ${enabledSatellites.length - constraints.maxSatellites}.`);
  }
  if (budgetRemaining < 0) {
    warnings.push(`Plan exceeds budget by ${Math.abs(budgetRemaining)} units.`);
  }
  if (uncoveredPoints.some((point) => point.priority === "critical")) {
    warnings.push("Critical demand remains uncovered.");
  }
  if (enabledSatellites.some((satellite) => !constraints.allowedSatelliteTypes.includes(satellite.typeId))) {
    warnings.push("Plan includes a disallowed satellite type.");
  }

  return {
    coveragePercent: demandPoints.length
      ? Math.round((coveredPoints.length / demandPoints.length) * 100)
      : 0,
    weightedCoveragePercent: totalWeightedDemand
      ? Math.round((coveredWeightedDemand / totalWeightedDemand) * 100)
      : 0,
    coveredPoints,
    uncoveredPoints,
    totalWeightedDemand,
    coveredWeightedDemand,
    totalCost,
    budgetRemaining,
    warnings,
  };
}
