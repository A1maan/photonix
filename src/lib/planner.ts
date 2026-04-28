import type { ComputeSatellite, GroundStation, OrbitalWorkload } from "../types";

export const DEEPSEEK_PLANNER_MODEL = "deepseek-v4-flash";

export const PLANNER_SECTION_TITLES = [
  "Recommended Orbit",
  "Data Center Assignment",
  "Downlink Plan",
  "Cost/Water Impact",
  "Risk Notes",
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
>;

export type PlannerGroundStation = Pick<
  GroundStation,
  "id" | "name" | "city" | "lat" | "lng" | "bandwidthGbps"
>;

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
  solar: "Solar uptime",
  latency: "Latency",
  cost: "Cost",
};

const WORKLOAD_IDS = ["llm", "imagery", "training", "mining"] as const;
const PRIORITIES: PlannerPriority[] = ["solar", "latency", "cost"];
const ALTITUDES: PlannerAltitudeKm[] = [550, 610, 720];
const SOURCES: PlannerSource[] = ["deepseek", "fallback"];
const CONFIDENCES: PlannerConfidence[] = ["low", "medium", "high"];

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
      massKg === undefined
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

  if (!question || !country || !workload || !metrics || !comparison || !computeSatellites || !groundStations) {
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
  const priorityLabel = PRIORITY_LABELS[request.constellation.priority];
  const primaryStations = request.groundStations
    .filter((station) => ["riyadh", "dubai", "abudhabi"].includes(station.id))
    .map((station) => station.city)
    .join(", ");
  const primaryCompute = request.computeSatellites.slice(0, request.workload.id === "training" ? 3 : 2);
  const primaryComputeNames = primaryCompute.map((satellite) => satellite.name).join(" and ");
  const reserve = request.computeSatellites.find((satellite) => satellite.id === "compute-c");

  return {
    source: "fallback",
    summary: "Deterministic Photonix planner response generated from the current mission model.",
    sections: [
      {
        title: "Recommended Orbit",
        body: `${request.constellation.altitudeKm} km dawn-dusk shell tuned for ${priorityLabel.toLowerCase()}, ${request.metrics.totalSatellites} compute sats across ${request.constellation.orbitalPlanes} orbital planes.`,
      },
      {
        title: "Data Center Assignment",
        body: `${request.workload.name} runs on ${primaryComputeNames || "the primary Photonix compute nodes"} first${
          reserve ? `, with ${reserve.name} held as regional reserve for burst or degraded operations` : ""
        }.`,
      },
      {
        title: "Downlink Plan",
        body: `Primary paths stay ${primaryStations || "Riyadh and Dubai"}, with modeled GCC coverage at ${request.metrics.coverageScore}%.`,
      },
      {
        title: "Cost/Water Impact",
        body: `${formatCurrency(request.metrics.launchCost)} launch envelope, ${formatCurrency(request.comparison.orbitalMonthlyCost)} modeled orbital monthly, and ${formatNumber(request.comparison.terrestrialWaterLitersDay)} L/day avoided versus ground cooling.`,
      },
      {
        title: "Risk Notes",
        body: "This is a modeled demo plan. Exact pass timing, radiation exposure, regulatory approvals, and live capacity pricing need production-grade analysis later.",
      },
    ],
    assumptions: [
      "Cached orbital inputs and modeled GCC downlink windows are used for the demo.",
      "Orbital cost, water, and uptime figures are scenario estimates, not procurement-grade commitments.",
    ],
    warnings,
    confidence: "medium",
  };
}
