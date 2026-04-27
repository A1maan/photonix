import type { ComputeSatellite, GroundStation, OrbitalWorkload, TrackedTle } from "../types";

function checksum(line: string) {
  let sum = 0;
  for (const char of line.slice(0, 68)) {
    if (char >= "0" && char <= "9") {
      sum += Number(char);
    } else if (char === "-") {
      sum += 1;
    }
  }
  return String(sum % 10);
}

function tleLine1(satnum: number) {
  const id = String(satnum).padStart(5, "0");
  const body = `1 ${id}U 24001A   26001.00000000  .00001264  00000+0  89214-4 0  999`;
  return body.slice(0, 68) + checksum(body);
}

function tleLine2(satnum: number, raanDeg: number, meanAnomalyDeg: number) {
  const id = String(satnum).padStart(5, "0");
  const raan = raanDeg.toFixed(4).padStart(8, " ");
  const meanAnomaly = meanAnomalyDeg.toFixed(4).padStart(8, " ");
  const rev = String(1200 + (satnum % 700)).padStart(5, "0");
  const body = `2 ${id}  53.2000 ${raan} 0001500  88.6000 ${meanAnomaly} 15.05560000${rev}`;
  return body.slice(0, 68) + checksum(body);
}

export const cachedStarlinkTles: TrackedTle[] = Array.from({ length: 168 }, (_, index) => {
  const satnum = 70001 + index;
  const orbitalPlane = index % 24;
  const slot = Math.floor(index / 24);
  const raan = (orbitalPlane * 15 + slot * 1.7) % 360;
  const meanAnomaly = (slot * 51.4 + orbitalPlane * 4.2) % 360;

  return {
    id: `starlink-${satnum}`,
    name: `STARLINK-${satnum}`,
    tle1: tleLine1(satnum),
    tle2: tleLine2(satnum, raan, meanAnomaly),
  };
});

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
