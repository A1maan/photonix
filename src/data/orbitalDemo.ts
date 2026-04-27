import type { ComputeSatellite, GroundStation, OrbitalWorkload } from "../types";
export { cachedStarlinkTles } from "./starlinkSnapshot";

export const groundStations: GroundStation[] = [
  { id: "riyadh", name: "Riyadh Ground Station", city: "Riyadh", lat: 24.7136, lng: 46.6753, bandwidthGbps: 2.4 },
  { id: "dubai", name: "Dubai Ground Station", city: "Dubai", lat: 25.2048, lng: 55.2708, bandwidthGbps: 2.1 },
  { id: "abudhabi", name: "Abu Dhabi Ground Station", city: "Abu Dhabi", lat: 24.4539, lng: 54.3773, bandwidthGbps: 2.0 },
  { id: "cairo", name: "Cairo Relay Site", city: "Cairo", lat: 30.0444, lng: 31.2357, bandwidthGbps: 1.6 },
  { id: "frankfurt", name: "Frankfurt Comparison Site", city: "Frankfurt", lat: 50.1109, lng: 8.6821, bandwidthGbps: 3.2 },
];

export const orbitalWorkloads: OrbitalWorkload[] = [
  {
    id: "llm",
    name: "LLM Inference",
    requiredPowerKw: 18,
    latencySensitive: true,
    target: "Riyadh + Dubai",
    description: "Frequent GCC downlinks for low-latency model serving.",
  },
  {
    id: "imagery",
    name: "Satellite Imagery Analysis",
    requiredPowerKw: 28,
    latencySensitive: false,
    target: "GCC remote sensing",
    description: "High-throughput edge processing for earth-observation data.",
  },
  {
    id: "training",
    name: "Model Training",
    requiredPowerKw: 48,
    latencySensitive: false,
    target: "Maximum solar uptime",
    description: "Power-heavy batch workloads that favor dawn-dusk orbit.",
  },
  {
    id: "mining",
    name: "Proof-of-Work Mining",
    requiredPowerKw: 22,
    latencySensitive: false,
    target: "Solar-only compute",
    description: "Deferrable workload that monetizes surplus orbital power.",
  },
];

export const computeSatellites: ComputeSatellite[] = [
  {
    id: "compute-a",
    name: "Photonix Dawn-1",
    orbitName: "550 km sun-synchronous",
    altitudeKm: 550,
    inclinationDeg: 97.6,
    raanDeg: 42,
    phaseDeg: 12,
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
    raanDeg: 222,
    phaseDeg: 194,
    gpuType: "B200",
    powerKw: 22,
    thermalCapacityKw: 28,
    sunlightPercent: 93,
    massKg: 580,
  },
  {
    id: "compute-c",
    name: "Photonix Gulf Nano",
    orbitName: "610 km regional support",
    altitudeKm: 610,
    inclinationDeg: 53.2,
    raanDeg: 102,
    phaseDeg: 286,
    gpuType: "Jetson Orin",
    powerKw: 4,
    thermalCapacityKw: 6,
    sunlightPercent: 71,
    massKg: 110,
  },
];
