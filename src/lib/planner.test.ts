import { describe, expect, it } from "vitest";
import {
  buildFallbackPlannerResponse,
  parsePlannerResponseJson,
  validatePlannerResponse,
  type PlannerRequest,
  type PlannerResponse,
} from "./planner";

const validResponse: PlannerResponse = {
  source: "deepseek",
  model: "deepseek-v4-flash",
  summary: "Use a 550 km dawn-dusk shell for the Saudi LLM inference scenario.",
  sections: [
    { title: "Recommended Orbit", body: "Use a 550 km dawn-dusk shell for high solar uptime." },
    { title: "Data Center Assignment", body: "Run LLM inference on Dawn-1 and Dawn-2." },
    { title: "Downlink Plan", body: "Prioritize Riyadh and Dubai downlinks." },
    { title: "Cost/Water Impact", body: "Use the modeled orbital cost and water avoidance estimates." },
    { title: "Risk Notes", body: "Exact pass windows and radiation exposure need production analysis." },
  ],
  assumptions: ["Modeled mission context only."],
  warnings: [],
  confidence: "medium",
};

const validRequest: PlannerRequest = {
  question: "Where should I place an orbital AI data center?",
  country: "Saudi Arabia",
  workload: {
    id: "llm",
    name: "LLM Inference",
    requiredPowerKw: 18,
    latencySensitive: true,
    description: "Frequent GCC downlinks for low-latency model serving.",
    target: "Riyadh + Dubai",
  },
  constellation: {
    orbitalPlanes: 2,
    satellitesPerPlane: 3,
    altitudeKm: 550,
    priority: "solar",
  },
  metrics: {
    totalSatellites: 6,
    launches: 1,
    launchCost: 67_000_000,
    solarUptime: 97,
    coverageScore: 94,
  },
  comparison: {
    orbitalPowerKw: 48,
    orbitalMonthlyCost: 150_000,
    orbitalUptime: 93.5,
    terrestrialMw: 17.7,
    terrestrialWaterLitersDay: 552_960,
    terrestrialMonthlyCost: 1_400_000,
    carbonSavingsKgDay: 116_736,
  },
  computeSatellites: [
    {
      id: "compute-a",
      name: "Photonix Dawn-1",
      orbitName: "550 km sun-synchronous",
      altitudeKm: 550,
      inclinationDeg: 97.6,
      gpuType: "Vera Rubin",
      powerKw: 26,
      thermalCapacityKw: 31,
      sunlightPercent: 94,
      massKg: 620,
    },
    {
      id: "compute-b",
      name: "Photonix Dawn-2",
      orbitName: "550 km sun-synchronous",
      altitudeKm: 550,
      inclinationDeg: 97.6,
      gpuType: "B200",
      powerKw: 22,
      thermalCapacityKw: 28,
      sunlightPercent: 93,
      massKg: 580,
    },
  ],
  groundStations: [
    {
      id: "riyadh",
      name: "Riyadh Ground Station",
      city: "Riyadh",
      lat: 24.7136,
      lng: 46.6753,
      bandwidthGbps: 2.4,
    },
  ],
};

describe("planner response validation", () => {
  it("accepts a complete planner response", () => {
    const result = validatePlannerResponse(validResponse);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sections).toHaveLength(5);
      expect(result.value.source).toBe("deepseek");
    }
  });

  it("rejects a response missing a required section", () => {
    const result = validatePlannerResponse({
      ...validResponse,
      sections: validResponse.sections.filter((section) => section.title !== "Risk Notes"),
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a response with an unknown section title", () => {
    const result = validatePlannerResponse({
      ...validResponse,
      sections: [
        ...validResponse.sections.slice(0, 4),
        { title: "Launch Manifest", body: "Unexpected section." },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects empty or invalid JSON content", () => {
    expect(parsePlannerResponseJson("").ok).toBe(false);
    expect(parsePlannerResponseJson("{not json").ok).toBe(false);
  });

  it("builds a deterministic fallback response with the required sections", () => {
    const fallback = buildFallbackPlannerResponse(validRequest, ["fallback reason"]);

    expect(fallback.source).toBe("fallback");
    expect(fallback.sections.map((section) => section.title)).toEqual([
      "Recommended Orbit",
      "Data Center Assignment",
      "Downlink Plan",
      "Cost/Water Impact",
      "Risk Notes",
    ]);
    expect(fallback.warnings).toContain("fallback reason");
  });
});
