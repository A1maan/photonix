import { describe, expect, it } from "vitest";
import {
  buildFallbackPlannerResponse,
  parsePlannerResponseJson,
  validatePlannerRequest,
  validatePlannerResponse,
  type PlannerRequest,
  type PlannerResponse,
} from "./planner";

const validResponse: PlannerResponse = {
  source: "deepseek",
  model: "deepseek-v4-flash",
  summary: "Route secondary experimental LLM inference to Photonix Dawn-1 via Riyadh.",
  sections: [
    { title: "Workload Fit", body: "The secondary experimental LLM workload fits the current scheduler target." },
    { title: "Recommended Satellite Assignment", body: "Assign Photonix Dawn-1 and hold Dawn-2 as backup." },
    { title: "Communication/Downlink Plan", body: "Prioritize Riyadh and keep Dubai as backup downlink." },
    { title: "Ground Comparison", body: "Use modeled orbital cost and water avoidance estimates." },
    { title: "Risk/Assumptions", body: "Exact pass windows and radiation exposure need production analysis." },
    { title: "Next Action", body: "Assign the workload and monitor queue, link, and thermal margin." },
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
      health: {
        thermalLoadPercent: 71,
        thermalMarginKw: 8,
        computeLoadPercent: 48,
        computeHeadroomPercent: 52,
        queueLoadPercent: 34,
        radiationRiskPercent: 12,
        linkQualityPercent: 91,
        linkReady: true,
      },
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
      health: {
        thermalLoadPercent: 84,
        thermalMarginKw: 5,
        computeLoadPercent: 63,
        computeHeadroomPercent: 37,
        queueLoadPercent: 58,
        radiationRiskPercent: 34,
        linkQualityPercent: 86,
        linkReady: true,
      },
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
  scheduler: {
    urgency: "priority",
    dataVolumeTb: 42,
    deadlineMinutes: 45,
    passWindowTolerance: "flex",
    splittable: true,
    compressible: true,
    bufferable: false,
    priority: "solar",
    leoNodeCount: 2,
  },
  routeAssignment: {
    recommendedSatelliteId: "compute-a",
    recommendedSatelliteName: "Photonix Dawn-1",
    backupSatelliteId: "compute-b",
    backupSatelliteName: "Photonix Dawn-2",
    degradedSatelliteIds: ["compute-b"],
    selectedGroundStationId: "riyadh",
    selectedGroundStationCity: "Riyadh",
    routeScore: 86,
    status: "ready",
    mode: "compressed",
    actions: ["assign", "compress"],
    estimatedNextHandoffMinutes: 14,
    reasons: ["Dawn-1 has the strongest route score."],
    riskNotes: ["Dawn-2 radiation risk is elevated."],
  },
};

describe("planner response validation", () => {
  it("accepts a complete planner request with scheduler, route, and health context", () => {
    const result = validatePlannerRequest(validRequest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scheduler.deadlineMinutes).toBe(45);
      expect(result.value.routeAssignment?.recommendedSatelliteId).toBe("compute-a");
      expect(result.value.computeSatellites[0].health.linkQualityPercent).toBe(91);
    }
  });

  it("accepts a complete planner response", () => {
    const result = validatePlannerResponse(validResponse);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sections).toHaveLength(6);
      expect(result.value.source).toBe("deepseek");
    }
  });

  it("rejects a response missing a required section", () => {
    const result = validatePlannerResponse({
      ...validResponse,
      sections: validResponse.sections.filter((section) => section.title !== "Next Action"),
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
      "Workload Fit",
      "Recommended Satellite Assignment",
      "Communication/Downlink Plan",
      "Ground Comparison",
      "Risk/Assumptions",
      "Next Action",
    ]);
    expect(fallback.warnings).toContain("fallback reason");
    expect(fallback.sections[1].body).toContain("Photonix Dawn-1");
    expect(fallback.sections[1].body).toContain("thermal margin");
  });
});
