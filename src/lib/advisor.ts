import type {
  AdvisorRecommendation,
  CoverageAnalysis,
  MissionGoal,
  OptimizationResult,
  OptimizationStrategy,
  PlanningConstraints,
} from "../types";

const strategyTemplates: Record<MissionGoal, Omit<OptimizationStrategy, "hardRules">> = {
  rural_broadband: {
    missionGoal: "rural_broadband",
    weights: {
      criticalDemandPriority: 0.16,
      populationWeight: 0.4,
      geographicSpread: 0.14,
      costEfficiency: 0.2,
      overlapPenalty: 0.1,
      redundancy: 0,
    },
    explanation:
      "Rural broadband prioritizes high-population uncovered rural clusters while keeping cost per covered demand point low.",
  },
  disaster_response: {
    missionGoal: "disaster_response",
    weights: {
      criticalDemandPriority: 0.34,
      populationWeight: 0.14,
      geographicSpread: 0.24,
      costEfficiency: 0.09,
      overlapPenalty: 0.1,
      redundancy: 0.09,
    },
    explanation:
      "Disaster response prioritizes critical emergency zones and broad geographic spread over raw population coverage.",
  },
  schools_clinics: {
    missionGoal: "schools_clinics",
    weights: {
      criticalDemandPriority: 0.3,
      populationWeight: 0.22,
      geographicSpread: 0.12,
      costEfficiency: 0.15,
      overlapPenalty: 0.1,
      redundancy: 0.11,
    },
    explanation:
      "Schools and clinics mode emphasizes high-priority public-service sites and resilient coverage near clinics.",
  },
  minimum_cost: {
    missionGoal: "minimum_cost",
    weights: {
      criticalDemandPriority: 0.12,
      populationWeight: 0.22,
      geographicSpread: 0.08,
      costEfficiency: 0.42,
      overlapPenalty: 0.14,
      redundancy: 0.02,
    },
    explanation:
      "Minimum-cost mode only adds satellites when the coverage gain per budget unit is strong.",
  },
  emergency_backup: {
    missionGoal: "emergency_backup",
    weights: {
      criticalDemandPriority: 0.28,
      populationWeight: 0.14,
      geographicSpread: 0.18,
      costEfficiency: 0.12,
      overlapPenalty: 0.08,
      redundancy: 0.2,
    },
    explanation:
      "Emergency backup mode values redundancy around emergency zones while still controlling cost.",
  },
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function getFallbackStrategy(constraints: PlanningConstraints): OptimizationStrategy {
  return validateStrategy({
    ...strategyTemplates[constraints.missionGoal],
    hardRules: {
      mustCoverCriticalPoints: constraints.missionGoal !== "minimum_cost",
      maxSatellites: constraints.maxSatellites,
      maxBudget: constraints.budget,
    },
  });
}

export function validateStrategy(strategy: OptimizationStrategy): OptimizationStrategy {
  const weights = Object.fromEntries(
    Object.entries(strategy.weights).map(([key, value]) => [key, clamp01(value)]),
  ) as OptimizationStrategy["weights"];

  return {
    ...strategy,
    weights,
    hardRules: {
      mustCoverCriticalPoints: Boolean(strategy.hardRules.mustCoverCriticalPoints),
      maxSatellites: Math.max(1, Math.floor(strategy.hardRules.maxSatellites)),
      maxBudget: Math.max(0, Math.floor(strategy.hardRules.maxBudget)),
    },
  };
}

export function explainCurrentPlan(
  analysis: CoverageAnalysis,
  constraints: PlanningConstraints,
  strategy: OptimizationStrategy,
): AdvisorRecommendation {
  const topGap = analysis.uncoveredPoints[0];
  const constraintStatus =
    analysis.budgetRemaining < 0
      ? `The plan is ${Math.abs(analysis.budgetRemaining)} units over budget.`
      : `${analysis.budgetRemaining} budget units remain.`;

  return {
    summary: `${analysis.weightedCoveragePercent}% weighted coverage for ${labelMission(constraints.missionGoal)}. ${constraintStatus}`,
    nextAction: topGap
      ? `Optimize around ${topGap.name}, currently the clearest uncovered planning gap.`
      : "Run the report and keep this plan as the current deployment baseline.",
    reason: strategy.explanation,
    tradeoff:
      analysis.uncoveredPoints.length > 0
        ? `${analysis.uncoveredPoints.length} demand locations remain uncovered under the current placement.`
        : "All tracked demand points are covered under the current constraints.",
  };
}

export function explainOptimization(result: OptimizationResult): AdvisorRecommendation {
  const gain = result.after.weightedCoveragePercent - result.before.weightedCoveragePercent;
  const uncoveredCritical = result.after.uncoveredPoints.filter((point) => point.priority === "critical");
  const costLine =
    result.after.budgetRemaining >= 0
      ? `${result.after.budgetRemaining} units remain after deployment.`
      : `The suggestion exceeds budget by ${Math.abs(result.after.budgetRemaining)} units.`;

  return {
    summary: `Optimized plan improves weighted coverage by ${gain} points to ${result.after.weightedCoveragePercent}%.`,
    nextAction:
      gain > 0
        ? "Apply the optimized placement, then review the remaining uncovered points."
        : "Increase budget, allow another satellite type, or add more capacity before optimizing again.",
    reason: `${result.strategy.explanation} ${costLine}`,
    tradeoff:
      uncoveredCritical.length > 0
        ? `${uncoveredCritical.length} critical locations still need coverage or redundancy.`
        : "The plan covers all critical demand points; remaining gaps are lower-priority tradeoffs.",
  };
}

export function labelMission(goal: MissionGoal) {
  return goal
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
