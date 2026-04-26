import type {
  DemandPoint,
  OptimizationResult,
  OptimizationStrategy,
  PlanningConstraints,
  Satellite,
  SatelliteType,
} from "../types";
import { analyzeCoverage, calculateTotalCost, demandWeight } from "./coverage";
import { centroid, haversineKm, spreadScore } from "./geo";

type Candidate = {
  lat: number;
  lng: number;
  typeId: string;
};

function buildCandidatePositions(uncovered: DemandPoint[], demandPoints: DemandPoint[]) {
  const anchors = uncovered.length > 0 ? uncovered : demandPoints;
  const candidates = anchors.map((point) => ({ lat: point.lat, lng: point.lng }));

  for (let i = 0; i < anchors.length; i += 1) {
    for (let j = i + 1; j < anchors.length; j += 1) {
      if (haversineKm(anchors[i], anchors[j]) < 650) {
        candidates.push(centroid([anchors[i], anchors[j]]));
      }
    }
  }

  if (anchors.length > 2) {
    candidates.push(centroid(anchors.slice(0, 4)));
  }

  return candidates;
}

function planIsValid(
  satellites: Satellite[],
  satelliteTypes: SatelliteType[],
  constraints: PlanningConstraints,
  strategy: OptimizationStrategy,
) {
  const enabled = satellites.filter((satellite) => satellite.enabled);
  const totalCost = calculateTotalCost(enabled, satelliteTypes);
  return (
    enabled.length <= Math.min(constraints.maxSatellites, strategy.hardRules.maxSatellites) &&
    totalCost <= Math.min(constraints.budget, strategy.hardRules.maxBudget) &&
    enabled.every((satellite) => constraints.allowedSatelliteTypes.includes(satellite.typeId))
  );
}

function scorePlan(
  satellites: Satellite[],
  demandPoints: DemandPoint[],
  satelliteTypes: SatelliteType[],
  constraints: PlanningConstraints,
  strategy: OptimizationStrategy,
) {
  const analysis = analyzeCoverage(satellites, demandPoints, satelliteTypes, constraints);
  const criticalCovered = analysis.coveredPoints.filter((point) => point.priority === "critical").length;
  const criticalTotal = demandPoints.filter((point) => point.priority === "critical").length || 1;
  const cost = analysis.totalCost || 1;
  const costEfficiency = analysis.coveredWeightedDemand / cost;
  const geographicSpread = spreadScore(satellites.filter((satellite) => satellite.enabled));
  const overlapPenalty = estimateOverlapPenalty(satellites, satelliteTypes);
  const redundancy = estimateRedundancy(satellites, demandPoints, satelliteTypes);

  return (
    (analysis.coveredWeightedDemand / Math.max(analysis.totalWeightedDemand, 1)) *
      strategy.weights.populationWeight *
      100 +
    (criticalCovered / criticalTotal) * strategy.weights.criticalDemandPriority * 100 +
    geographicSpread * strategy.weights.geographicSpread * 100 +
    Math.min(costEfficiency / 8, 1) * strategy.weights.costEfficiency * 100 -
    overlapPenalty * strategy.weights.overlapPenalty * 100 +
    redundancy * strategy.weights.redundancy * 100
  );
}

function estimateOverlapPenalty(satellites: Satellite[], satelliteTypes: SatelliteType[]) {
  const enabled = satellites.filter((satellite) => satellite.enabled);
  if (enabled.length < 2) {
    return 0;
  }

  let penalty = 0;
  let pairs = 0;
  for (let i = 0; i < enabled.length; i += 1) {
    for (let j = i + 1; j < enabled.length; j += 1) {
      const typeA = satelliteTypes.find((type) => type.id === enabled[i].typeId);
      const typeB = satelliteTypes.find((type) => type.id === enabled[j].typeId);
      if (!typeA || !typeB) {
        continue;
      }
      const distance = haversineKm(enabled[i], enabled[j]);
      const overlapThreshold = Math.min(typeA.radiusKm, typeB.radiusKm) * 0.9;
      if (distance < overlapThreshold) {
        penalty += 1 - distance / overlapThreshold;
      }
      pairs += 1;
    }
  }

  return pairs ? Math.min(penalty / pairs, 1) : 0;
}

function estimateRedundancy(
  satellites: Satellite[],
  demandPoints: DemandPoint[],
  satelliteTypes: SatelliteType[],
) {
  const critical = demandPoints.filter(
    (point) => point.priority === "critical" || point.category === "emergency",
  );
  if (critical.length === 0) {
    return 0;
  }

  const redundant = critical.filter((point) => {
    const covering = satellites.filter((satellite) => {
      const type = satelliteTypes.find((item) => item.id === satellite.typeId);
      return type && haversineKm(point, satellite) <= type.radiusKm;
    });
    return covering.length > 1;
  });

  return redundant.length / critical.length;
}

export function optimizeSatellites(
  satellites: Satellite[],
  demandPoints: DemandPoint[],
  satelliteTypes: SatelliteType[],
  constraints: PlanningConstraints,
  strategy: OptimizationStrategy,
): OptimizationResult {
  const before = analyzeCoverage(satellites, demandPoints, satelliteTypes, constraints);
  let bestSatellites: Satellite[] = satellites
    .filter((satellite) => satellite.enabled)
    .map((satellite) => ({ ...satellite, suggested: false }));
  let bestScore = planIsValid(bestSatellites, satelliteTypes, constraints, strategy)
    ? scorePlan(bestSatellites, demandPoints, satelliteTypes, constraints, strategy)
    : -Infinity;

  const allowedTypes = satelliteTypes.filter((type) =>
    constraints.allowedSatelliteTypes.includes(type.id),
  );
  const candidatePositions = buildCandidatePositions(before.uncoveredPoints, demandPoints);

  let improved = true;
  while (improved && bestSatellites.length < constraints.maxSatellites) {
    improved = false;
    let roundBest: Satellite[] | null = null;
    let roundScore = bestScore;

    for (const position of candidatePositions) {
      for (const type of allowedTypes) {
        const candidate: Candidate = { ...position, typeId: type.id };
        const plan = [
          ...bestSatellites,
          {
            id: `opt-${bestSatellites.length + 1}-${candidate.typeId}`,
            name: `Suggested ${bestSatellites.length + 1}`,
            typeId: candidate.typeId,
            lat: candidate.lat,
            lng: candidate.lng,
            enabled: true,
            suggested: true,
          },
        ];

        if (!planIsValid(plan, satelliteTypes, constraints, strategy)) {
          continue;
        }

        const candidateScore = scorePlan(plan, demandPoints, satelliteTypes, constraints, strategy);
        if (candidateScore > roundScore + 0.6) {
          roundBest = plan;
          roundScore = candidateScore;
        }
      }
    }

    if (roundBest) {
      bestSatellites = roundBest;
      bestScore = roundScore;
      improved = true;
    }
  }

  const after = analyzeCoverage(bestSatellites, demandPoints, satelliteTypes, constraints);

  return {
    suggestedSatellites: bestSatellites,
    before,
    after,
    strategy,
    explanation:
      after.weightedCoveragePercent > before.weightedCoveragePercent
        ? `Found a valid deployment under ${constraints.budget} budget units.`
        : "No valid candidate improved coverage under the current constraints.",
  };
}
