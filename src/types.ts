export type MissionGoal =
  | "rural_broadband"
  | "disaster_response"
  | "schools_clinics"
  | "minimum_cost"
  | "emergency_backup";

export type DemandCategory =
  | "rural"
  | "clinic"
  | "school"
  | "emergency"
  | "logistics"
  | "custom";

export type Priority = "low" | "medium" | "high" | "critical";

export type SatelliteType = {
  id: string;
  name: string;
  radiusKm: number;
  bandwidthMbps: number;
  cost: number;
  color: string;
  description: string;
};

export type Satellite = {
  id: string;
  name: string;
  typeId: string;
  lat: number;
  lng: number;
  enabled: boolean;
  suggested?: boolean;
};

export type DemandPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  priority: Priority;
  populationWeight: number;
  category: DemandCategory;
  userCreated?: boolean;
};

export type PlanningConstraints = {
  missionGoal: MissionGoal;
  maxSatellites: number;
  budget: number;
  allowedSatelliteTypes: string[];
};

export type CoverageAnalysis = {
  coveragePercent: number;
  weightedCoveragePercent: number;
  coveredPoints: DemandPoint[];
  uncoveredPoints: DemandPoint[];
  totalWeightedDemand: number;
  coveredWeightedDemand: number;
  totalCost: number;
  budgetRemaining: number;
  warnings: string[];
};

export type OptimizationStrategy = {
  missionGoal: MissionGoal;
  weights: {
    criticalDemandPriority: number;
    populationWeight: number;
    geographicSpread: number;
    costEfficiency: number;
    overlapPenalty: number;
    redundancy: number;
  };
  hardRules: {
    mustCoverCriticalPoints: boolean;
    maxSatellites: number;
    maxBudget: number;
  };
  explanation: string;
};

export type OptimizationResult = {
  suggestedSatellites: Satellite[];
  before: CoverageAnalysis;
  after: CoverageAnalysis;
  strategy: OptimizationStrategy;
  explanation: string;
};

export type AdvisorRecommendation = {
  summary: string;
  nextAction: string;
  reason: string;
  tradeoff: string;
};
