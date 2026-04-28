import type { ComputeSatellite, GroundStation, OrbitalWorkload } from "../types";

export const DEEPSEEK_PLANNER_MODEL = "deepseek-v4-flash";

export const PLANNER_SECTION_TITLES = [
  "Workload Fit",
  "Recommended Satellite Assignment",
  "Communication/Downlink Plan",
  "Ground Comparison",
  "Risk/Assumptions",
  "Next Action",
] as const;

export type PlannerSectionTitle = (typeof PLANNER_SECTION_TITLES)[number];
export type PlannerPriority = "solar" | "latency" | "cost";
export type PlannerAltitudeKm = 550 | 610 | 720;
export type PlannerSource = "deepseek" | "fallback";
export type PlannerConfidence = "low" | "medium" | "high";

export type PlannerSection = {
  title: PlannerSectionTitle;
  body: string;
};

export type PlannerPlanMetrics = {
  totalSatellites: number;
  launches: number;
  launchCost: number;
  solarUptime: number;
  coverageScore: number;
};

export type PlannerCostComparison = {
  orbitalPowerKw: number;
  orbitalMonthlyCost: number;
  orbitalUptime: number;
  terrestrialMw: number;
  terrestrialWaterLitersDay: number;
  terrestrialMonthlyCost: number;
  carbonSavingsKgDay: number;
};

export type PlannerWorkload = Pick<
  OrbitalWorkload,
  "id" | "name" | "requiredPowerKw" | "latencySensitive" | "description" | "target"
>;

export type PlannerComputeSatellite = Pick<
  ComputeSatellite,
  | "id"
  | "name"
  | "orbitName"
  | "altitudeKm"
  | "inclinationDeg"
  | "gpuType"
  | "powerKw"
  | "thermalCapacityKw"
  | "sunlightPercent"
  | "massKg"
> & {
  health: Pick<
    ComputeSatellite["health"],
    | "thermalLoadPercent"
    | "thermalMarginKw"
    | "computeLoadPercent"
    | "computeHeadroomPercent"
    | "queueLoadPercent"
    | "radiationRiskPercent"
    | "linkQualityPercent"
    | "linkReady"
  >;
};

export type PlannerGroundStation = Pick<
  GroundStation,
  "id" | "name" | "city" | "lat" | "lng" | "bandwidthGbps"
>;

export type PlannerSchedulerConstraints = {
  urgency: "flash" | "priority" | "standard";
  dataVolumeTb: number;
  deadlineMinutes: number;
  passWindowTolerance: "strict" | "flex" | "hold";
  splittable: boolean;
  compressible: boolean;
  bufferable: boolean;
  priority: PlannerPriority;
  leoNodeCount: number;
};

export type PlannerRouteAssignmentSummary = {
  recommendedSatelliteId: string;
  recommendedSatelliteName: string;
  backupSatelliteId?: string;
  backupSatelliteName?: string;
  degradedSatelliteIds: string[];
  selectedGroundStationId: string;
  selectedGroundStationCity: string;
  backupGroundStationId?: string;
  backupGroundStationCity?: string;
  routeScore: number;
  status: "ready" | "backup" | "degraded" | "hold";
  mode: "direct" | "split" | "buffered" | "compressed" | "migration" | "degraded";
  actions: string[];
  estimatedNextHandoffMinutes: number;
  reasons: string[];
  riskNotes: string[];
};

export type PlannerRequest = {
  question: string;
  country: string;
  workload: PlannerWorkload;
  constellation: {
    orbitalPlanes: number;
    satellitesPerPlane: number;
    altitudeKm: PlannerAltitudeKm;
    priority: PlannerPriority;
  };
  metrics: PlannerPlanMetrics;
  comparison: PlannerCostComparison;
  computeSatellites: PlannerComputeSatellite[];
  groundStations: PlannerGroundStation[];
  scheduler: PlannerSchedulerConstraints;
  routeAssignment: PlannerRouteAssignmentSummary | null;
};

export type PlannerResponse = {
  source: PlannerSource;
  model?: typeof DEEPSEEK_PLANNER_MODEL;
  summary: string;
  sections: PlannerSection[];
  assumptions: string[];
  warnings: string[];
  confidence: PlannerConfidence;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const PRIORITY_LABELS: Record<PlannerPriority, string> = {
  solar: "Power margin",
  latency: "Earliest downlink",
  cost: "Lowest cost",
};

const WORKLOAD_IDS = ["auto", "llm", "imagery", "training", "mining"] as const;
const PRIORITIES: PlannerPriority[] = ["solar", "latency", "cost"];
const ALTITUDES: PlannerAltitudeKm[] = [550, 610, 720];
const SOURCES: PlannerSource[] = ["deepseek", "fallback"];
const CONFIDENCES: PlannerConfidence[] = ["low", "medium", "high"];
const URGENCIES: PlannerSchedulerConstraints["urgency"][] = ["flash", "priority", "standard"];
const PASS_WINDOW_TOLERANCES: PlannerSchedulerConstraints["passWindowTolerance"][] = ["strict", "flex", "hold"];
const ROUTE_STATUSES: PlannerRouteAssignmentSummary["status"][] = ["ready", "backup", "degraded", "hold"];
const ROUTE_MODES: PlannerRouteAssignmentSummary["mode"][] = ["direct", "split", "buffered", "compressed", "migration", "degraded"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return isStringArray(value) ? value : undefined;
}

function isPlannerSectionTitle(value: unknown): value is PlannerSectionTitle {
  return typeof value === "string" && PLANNER_SECTION_TITLES.includes(value as PlannerSectionTitle);
}

function formatCurrency(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }
  return `$${Math.round(value)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return isFiniteNumber(value) ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return isNonEmptyString(value) ? value : undefined;
}

function validateWorkload(value: unknown): PlannerWorkload | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readString(value, "id");
  const name = readString(value, "name");
  const requiredPowerKw = readNumber(value, "requiredPowerKw");
  const description = readString(value, "description");
  const target = readString(value, "target");
  const latencySensitive = value.latencySensitive;

  if (
    !id ||
    !WORKLOAD_IDS.includes(id as (typeof WORKLOAD_IDS)[number]) ||
    !name ||
    requiredPowerKw === undefined ||
    typeof latencySensitive !== "boolean" ||
    !description ||
    !target
  ) {
    return undefined;
  }

  return { id: id as PlannerWorkload["id"], name, requiredPowerKw, latencySensitive, description, target };
}

function validatePlanMetrics(value: unknown): PlannerPlanMetrics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const totalSatellites = readNumber(value, "totalSatellites");
  const launches = readNumber(value, "launches");
  const launchCost = readNumber(value, "launchCost");
  const solarUptime = readNumber(value, "solarUptime");
  const coverageScore = readNumber(value, "coverageScore");

  if (
    totalSatellites === undefined ||
    launches === undefined ||
    launchCost === undefined ||
    solarUptime === undefined ||
    coverageScore === undefined
  ) {
    return undefined;
  }

  return { totalSatellites, launches, launchCost, solarUptime, coverageScore };
}

function validateCostComparison(value: unknown): PlannerCostComparison | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const orbitalPowerKw = readNumber(value, "orbitalPowerKw");
  const orbitalMonthlyCost = readNumber(value, "orbitalMonthlyCost");
  const orbitalUptime = readNumber(value, "orbitalUptime");
  const terrestrialMw = readNumber(value, "terrestrialMw");
  const terrestrialWaterLitersDay = readNumber(value, "terrestrialWaterLitersDay");
  const terrestrialMonthlyCost = readNumber(value, "terrestrialMonthlyCost");
  const carbonSavingsKgDay = readNumber(value, "carbonSavingsKgDay");

  if (
    orbitalPowerKw === undefined ||
    orbitalMonthlyCost === undefined ||
    orbitalUptime === undefined ||
    terrestrialMw === undefined ||
    terrestrialWaterLitersDay === undefined ||
    terrestrialMonthlyCost === undefined ||
    carbonSavingsKgDay === undefined
  ) {
    return undefined;
  }

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

function validateComputeSatellites(value: unknown): PlannerComputeSatellite[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const satellites = value.map((item) => {
    if (!isRecord(item)) {
      return undefined;
    }

    const id = readString(item, "id");
    const name = readString(item, "name");
    const orbitName = readString(item, "orbitName");
    const altitudeKm = readNumber(item, "altitudeKm");
    const inclinationDeg = readNumber(item, "inclinationDeg");
    const gpuType = readString(item, "gpuType");
    const powerKw = readNumber(item, "powerKw");
    const thermalCapacityKw = readNumber(item, "thermalCapacityKw");
    const sunlightPercent = readNumber(item, "sunlightPercent");
    const massKg = readNumber(item, "massKg");
    const health = isRecord(item.health) ? item.health : undefined;
    const thermalLoadPercent = health ? readNumber(health, "thermalLoadPercent") : undefined;
    const thermalMarginKw = health ? readNumber(health, "thermalMarginKw") : undefined;
    const computeLoadPercent = health ? readNumber(health, "computeLoadPercent") : undefined;
    const computeHeadroomPercent = health ? readNumber(health, "computeHeadroomPercent") : undefined;
    const queueLoadPercent = health ? readNumber(health, "queueLoadPercent") : undefined;
    const radiationRiskPercent = health ? readNumber(health, "radiationRiskPercent") : undefined;
    const linkQualityPercent = health ? readNumber(health, "linkQualityPercent") : undefined;
    const linkReady = health?.linkReady;

    if (
      !id ||
      !name ||
      !orbitName ||
      altitudeKm === undefined ||
      inclinationDeg === undefined ||
      !gpuType ||
      powerKw === undefined ||
      thermalCapacityKw === undefined ||
      sunlightPercent === undefined ||
      massKg === undefined ||
      thermalLoadPercent === undefined ||
      thermalMarginKw === undefined ||
      computeLoadPercent === undefined ||
      computeHeadroomPercent === undefined ||
      queueLoadPercent === undefined ||
      radiationRiskPercent === undefined ||
      linkQualityPercent === undefined ||
      typeof linkReady !== "boolean"
    ) {
      return undefined;
    }

    return {
      id,
      name,
      orbitName,
      altitudeKm,
      inclinationDeg,
      gpuType: gpuType as PlannerComputeSatellite["gpuType"],
      powerKw,
      thermalCapacityKw,
      sunlightPercent,
      massKg,
      health: {
        thermalLoadPercent,
        thermalMarginKw,
        computeLoadPercent,
        computeHeadroomPercent,
        queueLoadPercent,
        radiationRiskPercent,
        linkQualityPercent,
        linkReady,
      },
    };
  });

  return satellites.every(Boolean) ? (satellites as PlannerComputeSatellite[]) : undefined;
}

function validateGroundStations(value: unknown): PlannerGroundStation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const stations = value.map((item) => {
    if (!isRecord(item)) {
      return undefined;
    }

    const id = readString(item, "id");
    const name = readString(item, "name");
    const city = readString(item, "city");
    const lat = readNumber(item, "lat");
    const lng = readNumber(item, "lng");
    const bandwidthGbps = readNumber(item, "bandwidthGbps");

    if (!id || !name || !city || lat === undefined || lng === undefined || bandwidthGbps === undefined) {
      return undefined;
    }

    return { id, name, city, lat, lng, bandwidthGbps };
  });

  return stations.every(Boolean) ? (stations as PlannerGroundStation[]) : undefined;
}

function validateScheduler(value: unknown): PlannerSchedulerConstraints | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const urgency = readString(value, "urgency");
  const dataVolumeTb = readNumber(value, "dataVolumeTb");
  const deadlineMinutes = readNumber(value, "deadlineMinutes");
  const passWindowTolerance = readString(value, "passWindowTolerance");
  const splittable = value.splittable;
  const compressible = value.compressible;
  const bufferable = value.bufferable;
  const priority = readString(value, "priority");
  const leoNodeCount = readNumber(value, "leoNodeCount");

  if (
    !urgency ||
    !URGENCIES.includes(urgency as PlannerSchedulerConstraints["urgency"]) ||
    dataVolumeTb === undefined ||
    deadlineMinutes === undefined ||
    !passWindowTolerance ||
    !PASS_WINDOW_TOLERANCES.includes(passWindowTolerance as PlannerSchedulerConstraints["passWindowTolerance"]) ||
    typeof splittable !== "boolean" ||
    typeof compressible !== "boolean" ||
    typeof bufferable !== "boolean" ||
    !priority ||
    !PRIORITIES.includes(priority as PlannerPriority) ||
    leoNodeCount === undefined
  ) {
    return undefined;
  }

  return {
    urgency: urgency as PlannerSchedulerConstraints["urgency"],
    dataVolumeTb,
    deadlineMinutes,
    passWindowTolerance: passWindowTolerance as PlannerSchedulerConstraints["passWindowTolerance"],
    splittable,
    compressible,
    bufferable,
    priority: priority as PlannerPriority,
    leoNodeCount,
  };
}

function validateRouteAssignment(value: unknown): PlannerRouteAssignmentSummary | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const recommendedSatelliteId = readString(value, "recommendedSatelliteId");
  const recommendedSatelliteName = readString(value, "recommendedSatelliteName");
  const backupSatelliteId = readString(value, "backupSatelliteId");
  const backupSatelliteName = readString(value, "backupSatelliteName");
  const degradedSatelliteIds = readStringArray(value, "degradedSatelliteIds");
  const selectedGroundStationId = readString(value, "selectedGroundStationId");
  const selectedGroundStationCity = readString(value, "selectedGroundStationCity");
  const backupGroundStationId = readString(value, "backupGroundStationId");
  const backupGroundStationCity = readString(value, "backupGroundStationCity");
  const routeScore = readNumber(value, "routeScore");
  const status = readString(value, "status");
  const mode = readString(value, "mode");
  const actions = readStringArray(value, "actions");
  const estimatedNextHandoffMinutes = readNumber(value, "estimatedNextHandoffMinutes");
  const reasons = readStringArray(value, "reasons");
  const riskNotes = readStringArray(value, "riskNotes");

  if (
    !recommendedSatelliteId ||
    !recommendedSatelliteName ||
    !degradedSatelliteIds ||
    !selectedGroundStationId ||
    !selectedGroundStationCity ||
    routeScore === undefined ||
    !status ||
    !ROUTE_STATUSES.includes(status as PlannerRouteAssignmentSummary["status"]) ||
    !mode ||
    !ROUTE_MODES.includes(mode as PlannerRouteAssignmentSummary["mode"]) ||
    !actions ||
    estimatedNextHandoffMinutes === undefined ||
    !reasons ||
    !riskNotes
  ) {
    return undefined;
  }

  return {
    recommendedSatelliteId,
    recommendedSatelliteName,
    backupSatelliteId,
    backupSatelliteName,
    degradedSatelliteIds,
    selectedGroundStationId,
    selectedGroundStationCity,
    backupGroundStationId,
    backupGroundStationCity,
    routeScore,
    status: status as PlannerRouteAssignmentSummary["status"],
    mode: mode as PlannerRouteAssignmentSummary["mode"],
    actions,
    estimatedNextHandoffMinutes,
    reasons,
    riskNotes,
  };
}

export function validatePlannerRequest(value: unknown): ValidationResult<PlannerRequest> {
  if (!isRecord(value)) {
    return { ok: false, error: "Planner request must be an object." };
  }

  const question = readString(value, "question");
  const country = readString(value, "country");
  const workload = validateWorkload(value.workload);
  const metrics = validatePlanMetrics(value.metrics);
  const comparison = validateCostComparison(value.comparison);
  const computeSatellites = validateComputeSatellites(value.computeSatellites);
  const groundStations = validateGroundStations(value.groundStations);
  const scheduler = validateScheduler(value.scheduler);
  const routeAssignment = validateRouteAssignment(value.routeAssignment);

  if (
    !question ||
    !country ||
    !workload ||
    !metrics ||
    !comparison ||
    !computeSatellites ||
    !groundStations ||
    !scheduler ||
    routeAssignment === undefined
  ) {
    return { ok: false, error: "Planner request is missing required mission context." };
  }

  if (!isRecord(value.constellation)) {
    return { ok: false, error: "Planner request is missing constellation settings." };
  }

  const orbitalPlanes = readNumber(value.constellation, "orbitalPlanes");
  const satellitesPerPlane = readNumber(value.constellation, "satellitesPerPlane");
  const altitudeKm = readNumber(value.constellation, "altitudeKm");
  const priority = readString(value.constellation, "priority");

  if (
    orbitalPlanes === undefined ||
    satellitesPerPlane === undefined ||
    !ALTITUDES.includes(altitudeKm as PlannerAltitudeKm) ||
    !PRIORITIES.includes(priority as PlannerPriority)
  ) {
    return { ok: false, error: "Planner request has invalid constellation settings." };
  }

  return {
    ok: true,
    value: {
      question,
      country,
      workload,
      constellation: {
        orbitalPlanes,
        satellitesPerPlane,
        altitudeKm: altitudeKm as PlannerAltitudeKm,
        priority: priority as PlannerPriority,
      },
      metrics,
      comparison,
      computeSatellites,
      groundStations,
      scheduler,
      routeAssignment,
    },
  };
}

export function validatePlannerResponse(value: unknown): ValidationResult<PlannerResponse> {
  if (!isRecord(value)) {
    return { ok: false, error: "Planner response must be an object." };
  }

  const source = readString(value, "source");
  const summary = readString(value, "summary");
  const assumptions = value.assumptions;
  const warnings = value.warnings;
  const confidence = readString(value, "confidence");
  const model = value.model;

  if (!source || !SOURCES.includes(source as PlannerSource)) {
    return { ok: false, error: "Planner response source is invalid." };
  }

  if (model !== undefined && model !== DEEPSEEK_PLANNER_MODEL) {
    return { ok: false, error: "Planner response model is invalid." };
  }

  if (!summary) {
    return { ok: false, error: "Planner response summary is required." };
  }

  if (!isStringArray(assumptions) || !isStringArray(warnings)) {
    return { ok: false, error: "Planner response assumptions and warnings must be string arrays." };
  }

  if (!confidence || !CONFIDENCES.includes(confidence as PlannerConfidence)) {
    return { ok: false, error: "Planner response confidence is invalid." };
  }

  if (!Array.isArray(value.sections)) {
    return { ok: false, error: "Planner response sections must be an array." };
  }

  const sectionsByTitle = new Map<PlannerSectionTitle, PlannerSection>();
  for (const section of value.sections) {
    if (!isRecord(section)) {
      return { ok: false, error: "Planner section must be an object." };
    }

    const title = section.title;
    const body = readString(section, "body");

    if (!isPlannerSectionTitle(title)) {
      return { ok: false, error: "Planner response contains an unknown section title." };
    }

    if (!body) {
      return { ok: false, error: `Planner section "${title}" is missing body text.` };
    }

    if (sectionsByTitle.has(title)) {
      return { ok: false, error: `Planner response contains duplicate section "${title}".` };
    }

    sectionsByTitle.set(title, { title, body });
  }

  const missingTitle = PLANNER_SECTION_TITLES.find((title) => !sectionsByTitle.has(title));
  if (missingTitle) {
    return { ok: false, error: `Planner response is missing section "${missingTitle}".` };
  }

  return {
    ok: true,
    value: {
      source: source as PlannerSource,
      model: model as PlannerResponse["model"],
      summary,
      sections: PLANNER_SECTION_TITLES.map((title) => sectionsByTitle.get(title) as PlannerSection),
      assumptions,
      warnings,
      confidence: confidence as PlannerConfidence,
    },
  };
}

export function parsePlannerResponseJson(content: string): ValidationResult<PlannerResponse> {
  if (!content.trim()) {
    return { ok: false, error: "Planner response content is empty." };
  }

  try {
    return validatePlannerResponse(JSON.parse(content));
  } catch {
    return { ok: false, error: "Planner response content is not valid JSON." };
  }
}

export function buildFallbackPlannerResponse(request: PlannerRequest, warnings: string[] = []): PlannerResponse {
  const priorityLabel = PRIORITY_LABELS[request.scheduler.priority];
  const route = request.routeAssignment;
  const recommended =
    request.computeSatellites.find((satellite) => satellite.id === route?.recommendedSatelliteId) ??
    request.computeSatellites[0];
  const backup =
    request.computeSatellites.find((satellite) => satellite.id === route?.backupSatelliteId) ??
    request.computeSatellites.find((satellite) => satellite.id !== recommended?.id);
  const selectedGround =
    request.groundStations.find((station) => station.id === route?.selectedGroundStationId) ??
    request.groundStations.find((station) => station.id === "riyadh") ??
    request.groundStations[0];
  const backupGround =
    request.groundStations.find((station) => station.id === route?.backupGroundStationId) ??
    request.groundStations.find((station) => station.id !== selectedGround?.id);
  const workloadQualifier =
    request.workload.id === "auto"
      ? "multi-company job queue"
      : request.workload.id === "llm"
        ? "secondary experimental LLM inference workload"
        : request.workload.name.toLowerCase();
  const routeScore = route ? `${route.routeScore}/100 ${route.status}` : "modeled";
  const handoff = route ? `${route.estimatedNextHandoffMinutes} min` : `${request.scheduler.deadlineMinutes} min target`;
  const action = route?.actions[0] ?? "assign";
  const healthLine = recommended
    ? `${recommended.health.thermalMarginKw} kW thermal margin, ${recommended.health.queueLoadPercent}% queue, ${recommended.health.linkQualityPercent}% link quality, and ${recommended.health.radiationRiskPercent}% radiation risk`
    : "available health telemetry";

  return {
    source: "fallback",
    summary: `Route ${workloadQualifier} to ${
      recommended?.name ?? "the top ranked compute node"
    } via ${selectedGround?.city ?? "the selected ground station"}.`,
    sections: [
      {
        title: "Workload Fit",
        body: `${request.workload.name} needs ${request.workload.requiredPowerKw} kW, ${request.scheduler.dataVolumeTb} TB handling, and a ${request.scheduler.deadlineMinutes} minute deadline. Scheduler priority is ${priorityLabel.toLowerCase()} with ${request.scheduler.splittable ? "splittable" : "atomic"} chunks and ${request.scheduler.compressible ? "compression enabled" : "raw outputs"}.`,
      },
      {
        title: "Recommended Satellite Assignment",
        body: `${recommended?.name ?? "Top ranked node"} is assigned for the ${workloadQualifier}; route score is ${routeScore}. Health context: ${healthLine}.${
          backup ? ` ${backup.name} remains backup.` : ""
        }`,
      },
      {
        title: "Communication/Downlink Plan",
        body: `${selectedGround?.city ?? "Selected ground station"} is primary downlink${
          backupGround ? ` with ${backupGround.city} as backup` : ""
        }. Estimated next handoff is ${handoff}; current route action is ${action}.`,
      },
      {
        title: "Ground Comparison",
        body: `${formatCurrency(request.comparison.orbitalMonthlyCost)} modeled orbital monthly versus ${formatCurrency(request.comparison.terrestrialMonthlyCost)} ground monthly, with ${formatNumber(request.comparison.terrestrialWaterLitersDay)} L/day cooling water avoided.`,
      },
      {
        title: "Risk/Assumptions",
        body:
          route?.riskNotes.slice(0, 2).join(" ") ||
          "This is a modeled demo route. Exact pass timing, radiation exposure, regulatory approvals, and live capacity pricing need production-grade analysis later.",
      },
      {
        title: "Next Action",
        body: `Execute ${route?.actions.map((item) => item.toUpperCase()).join(" / ") || "ASSIGN"} on ${
          recommended?.name ?? "the selected compute node"
        }, monitor queue and link quality, and keep ${backup?.name ?? "the backup node"} ready for handoff.`,
      },
    ],
    assumptions: [
      "Route assignment is deterministic and based on modeled LEO position, health, scheduler constraints, and ground station geometry.",
      "Orbital cost, water, and uptime figures are scenario estimates, not procurement-grade commitments.",
    ],
    warnings,
    confidence: "medium",
  };
}
