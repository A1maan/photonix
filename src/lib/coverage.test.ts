import { describe, expect, it } from "vitest";
import { satelliteTypes } from "../data/demo";
import type { DemandPoint, PlanningConstraints, Satellite } from "../types";
import { analyzeCoverage, calculateTotalCost } from "./coverage";
import { haversineKm } from "./geo";
import { getFallbackStrategy } from "./advisor";
import { optimizeSatellites } from "./optimizer";

const constraints: PlanningConstraints = {
  missionGoal: "rural_broadband",
  maxSatellites: 2,
  budget: 100,
  allowedSatelliteTypes: ["leo-economy", "meo-balanced"],
};

const demand: DemandPoint[] = [
  {
    id: "d1",
    name: "Covered village",
    lat: 24,
    lng: 45,
    priority: "high",
    populationWeight: 50,
    category: "rural",
  },
  {
    id: "d2",
    name: "Far clinic",
    lat: 29,
    lng: 39,
    priority: "critical",
    populationWeight: 60,
    category: "clinic",
  },
];

const satellites: Satellite[] = [
  { id: "s1", name: "Relay", typeId: "leo-economy", lat: 24, lng: 45, enabled: true },
];

describe("coverage engine", () => {
  it("calculates haversine distance", () => {
    expect(Math.round(haversineKm({ lat: 24, lng: 45 }, { lat: 24, lng: 45 }))).toBe(0);
    expect(haversineKm({ lat: 24, lng: 45 }, { lat: 25, lng: 45 })).toBeGreaterThan(100);
  });

  it("detects covered demand points and weighted coverage", () => {
    const analysis = analyzeCoverage(satellites, demand, satelliteTypes, constraints);
    expect(analysis.coveredPoints).toHaveLength(1);
    expect(analysis.uncoveredPoints).toHaveLength(1);
    expect(analysis.weightedCoveragePercent).toBeGreaterThan(0);
  });

  it("calculates deployment cost", () => {
    expect(calculateTotalCost(satellites, satelliteTypes)).toBe(32);
  });
});

describe("optimizer", () => {
  it("respects budget and satellite limit while preserving or improving coverage", () => {
    const before = analyzeCoverage(satellites, demand, satelliteTypes, constraints);
    const result = optimizeSatellites(
      satellites,
      demand,
      satelliteTypes,
      constraints,
      getFallbackStrategy(constraints),
    );

    expect(result.suggestedSatellites.length).toBeLessThanOrEqual(constraints.maxSatellites);
    expect(result.after.totalCost).toBeLessThanOrEqual(constraints.budget);
    expect(result.after.weightedCoveragePercent).toBeGreaterThanOrEqual(before.weightedCoveragePercent);
  });
});
