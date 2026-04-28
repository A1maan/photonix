import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Clock3,
  Cpu,
  DatabaseZap,
  Maximize2,
  Orbit,
  Pause,
  Play,
  RadioTower,
  Satellite,
  Send,
  Sparkles,
  Sun,
  Waves,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cachedStarlinkTles, computeSatellites, groundStations, orbitalWorkloads } from "../data/orbitalDemo";
import {
  buildDownlinkArcs,
  buildSunSyncPath,
  buildOrbitalRouteAssignment,
  compareOrbitalToTerrestrial,
  createTrackedSatellites,
  groundStationPoints,
  projectComputeSatellite,
  propagateTrackedSatellites,
  rankComputeSatellitesForWorkload,
  type ComputeRoutingRole,
  type DownlinkArc,
  type OrbitalRouteAssignment,
  type OrbitalRouteStatus,
  type OrbitPoint,
} from "../lib/orbit";
import {
  buildFallbackPlannerResponse,
  validatePlannerResponse,
  type PlannerRequest,
  type PlannerResponse,
  type PlannerSection,
} from "../lib/planner";
import { createSolarStormVfx, type SolarStormVfxHandle } from "../lib/solarStormVfx";
import { getCachedSpaceWeatherScenario, loadSpaceWeatherScenario, type SpaceWeatherScenario } from "../lib/spaceWeather";
import type { OrbitalWorkload } from "../types";

type MissionControlProps = {
  country: string;
  logoTransitioning?: boolean;
  onBackToGlobe: () => void;
};

type MissionMode = "plan" | "simulate";
type PlanPriority = "solar" | "latency" | "cost";
type AltitudePreset = 550 | 610 | 720;
type SchedulerUrgency = "flash" | "priority" | "standard";
type PassWindowTolerance = "strict" | "flex" | "hold";
type SchedulerSnapshot = {
  urgency: SchedulerUrgency;
  dataVolumeTb: number;
  deadlineMinutes: number;
  passWindowTolerance: PassWindowTolerance;
  splittable: boolean;
  compressible: boolean;
  bufferable: boolean;
  priority: PlanPriority;
  leoNodeCount: number;
};

type PlanMetrics = {
  totalSatellites: number;
  launches: number;
  launchCost: number;
  solarUptime: number;
  coverageScore: number;
};

const SAUDI_VIEW = { lat: 24.4, lng: 49.2, altitude: 1.34 };
const GLOBE_IMAGE_URL = "/assets/earth-day.jpg";
const BACKGROUND_IMAGE_URL = "/assets/night-sky.png";
const DEMO_ORBIT_START = Date.UTC(2026, 3, 28, 0, 0, 0);
const DEFAULT_QUESTION =
  "Split this incoming multi-company job queue across the moving LEO compute nodes based on each job's hardware, deadline, data-volume, and downlink constraints.";
const ALTITUDE_PRESETS: AltitudePreset[] = [550, 610, 720];
const PRIORITIES: Array<{ id: PlanPriority; label: string }> = [
  { id: "solar", label: "Power margin" },
  { id: "latency", label: "Earliest downlink" },
  { id: "cost", label: "Lowest cost" },
];
const URGENCY_LEVELS: Array<{ id: SchedulerUrgency; label: string; detail: string }> = [
  { id: "flash", label: "Flash SLA", detail: "< 20 min" },
  { id: "priority", label: "Priority", detail: "< 45 min" },
  { id: "standard", label: "Standard", detail: "< 2 hr" },
];
const PASS_WINDOW_TOLERANCES: Array<{ id: PassWindowTolerance; label: string; detail: string }> = [
  { id: "strict", label: "Strict", detail: "single pass" },
  { id: "flex", label: "Flexible", detail: "+2 passes" },
  { id: "hold", label: "Holdable", detail: "buffer ok" },
];
const LAUNCH_COST_USD = 67_000_000;

function useWindowSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1440 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
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

function formatUtcTime(value?: string) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;
}

function formatSeverity(scenario: SpaceWeatherScenario) {
  return `${scenario.severity.toUpperCase()} / ${Math.round(scenario.intensity * 100)}%`;
}

function formatCoordinate(value: number, axis: "lat" | "lng") {
  const direction = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(1)} deg ${direction}`;
}

function globeVector(globe: GlobeMethods, lat: number, lng: number, altitude: number) {
  const coords = globe.getCoords(lat, lng, altitude);
  return new THREE.Vector3(coords.x, coords.y, coords.z);
}

function routingRoleLabel(role: ComputeRoutingRole) {
  if (role === "recommended") {
    return "Recommended";
  }
  if (role === "backup") {
    return "Backup";
  }
  return "Degraded";
}

function routingRoleClass(role: ComputeRoutingRole) {
  if (role === "recommended") {
    return "status-ok";
  }
  if (role === "backup") {
    return "status-warn";
  }
  return "status-danger";
}

function routeStatusClass(status: OrbitalRouteStatus | ComputeRoutingRole) {
  if (status === "ready" || status === "recommended") {
    return "status-ok";
  }
  if (status === "backup" || status === "hold") {
    return "status-warn";
  }
  if (status === "degraded") {
    return "status-danger";
  }
  return "status-cold";
}

function routeRoleForSatellite(route: OrbitalRouteAssignment | null, satelliteId: string): ComputeRoutingRole | null {
  if (!route) {
    return null;
  }
  if (route.recommendedNode.satellite.id === satelliteId) {
    return "recommended";
  }
  if (route.backupNode?.satellite.id === satelliteId) {
    return "backup";
  }
  if (route.degradedNodes.some((node) => node.satellite.id === satelliteId)) {
    return "degraded";
  }
  return null;
}

type OperationalPlaybookItem = {
  action: string;
  target: string;
  status: "ready" | "active" | "warn" | "hold";
  detail: string;
};

function buildOperationalPlaybook(
  stormActive: boolean,
  route: OrbitalRouteAssignment | null,
  workload: OrbitalWorkload,
): OperationalPlaybookItem[] {
  const recommended = route?.recommendedNode.satellite.name ?? "best ranked LEO node";
  const backup = route?.backupNode?.satellite.name ?? "backup LEO node";
  const primaryGround = route?.selectedGroundStation.city ?? "primary ground station";
  const backupGround = route?.backupGroundStation?.city ?? "backup ground station";
  const routeActions = new Set(route?.actions ?? ["assign"]);
  const urgentWorkload =
    workload.id === "auto"
      ? "highest-priority company jobs"
      : workload.id === "imagery"
        ? "urgent imagery triage"
        : workload.name.toLowerCase();

  if (stormActive) {
    return [
      {
        action: "Pause",
        target: "Photonix Dawn-2",
        status: "warn",
        detail: "Stop non-critical queues during elevated radiation exposure.",
      },
      {
        action: routeActions.has("migrate") ? "Migrate" : "Assign",
        target: recommended,
        status: "active",
        detail: `Move ${urgentWorkload} to the healthiest available node.`,
      },
      {
        action: routeActions.has("compress") ? "Compress" : "Buffer",
        target: "Lower-priority data",
        status: routeActions.has("buffer") ? "hold" : "ready",
        detail: "Downlink derived products first; hold bulk payloads if pass margin tightens.",
      },
      {
        action: "Route",
        target: `${primaryGround} / ${backupGround}`,
        status: "active",
        detail: "Send urgent results through primary ground, keep backup armed.",
      },
    ];
  }

  return [
    {
      action: "Assign",
      target: recommended,
      status: "ready",
      detail: `Keep ${workload.name.toLowerCase()} on the current recommended route.`,
    },
    {
      action: routeActions.has("compress") ? "Compress" : "Monitor",
      target: "Queue and link",
      status: "ready",
      detail: "Watch queue load, thermal margin, and link quality before handoff.",
    },
    {
      action: routeActions.has("split") ? "Split" : "Standby",
      target: backup,
      status: routeActions.has("split") ? "active" : "ready",
      detail: "Keep backup compute warm for burst or degraded route conditions.",
    },
    {
      action: routeActions.has("buffer") || routeActions.has("hold") ? "Buffer" : "Route",
      target: primaryGround,
      status: routeActions.has("buffer") || routeActions.has("hold") ? "hold" : "ready",
      detail: `${route?.estimatedNextHandoffMinutes ?? 0} min modeled handoff; backup ground remains available.`,
    },
  ];
}

function makeTextSprite(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = "rgba(2, 6, 11, 0.84)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    context.fillStyle = color;
    context.font = "700 28px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(13.6, 3.8, 1);
  sprite.position.set(0, 6.1, 0);
  return sprite;
}

function createOrbitalDataCenterModel(point: OrbitPoint, stormActive: boolean, selected: boolean) {
  const atRisk = stormActive && point.id === "compute-b";
  const takingOver = stormActive && point.id === "compute-a";
  const accent = atRisk ? "#ef4444" : takingOver ? "#34d399" : selected ? "#ffffff" : "#ffd166";
  const group = new THREE.Group();
  group.name = point.name;
  group.scale.setScalar(selected ? 1.18 : 1);

  const bus = new THREE.Mesh(
    new THREE.BoxGeometry(3.35, 1.85, 1.85),
    new THREE.MeshStandardMaterial({
      color: atRisk ? "#3a1010" : "#141b24",
      emissive: atRisk ? "#7f1d1d" : takingOver ? "#064e3b" : "#3b2a09",
      emissiveIntensity: atRisk ? 0.9 : 0.42,
      metalness: 0.68,
      roughness: 0.32,
    }),
  );
  group.add(bus);

  const core = new THREE.Mesh(
    new THREE.BoxGeometry(1.78, 2.05, 1.95),
    new THREE.MeshStandardMaterial({
      color: "#050b12",
      emissive: accent,
      emissiveIntensity: atRisk ? 0.42 : 0.28,
      metalness: 0.5,
      roughness: 0.38,
    }),
  );
  group.add(core);

  const panelMaterial = new THREE.MeshStandardMaterial({
    color: atRisk ? "#5f1717" : "#0f3d4a",
    emissive: atRisk ? "#ef4444" : "#22d3ee",
    emissiveIntensity: atRisk ? 0.44 : 0.24,
    metalness: 0.25,
    roughness: 0.46,
    side: THREE.DoubleSide,
  });
  const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.13, 2.05), panelMaterial);
  leftPanel.position.x = -4.15;
  const rightPanel = leftPanel.clone();
  rightPanel.position.x = 4.15;
  group.add(leftPanel, rightPanel);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 2.45, 10),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.4 }),
  );
  antenna.position.y = 2.2;
  antenna.rotation.z = Math.PI / 7;
  group.add(antenna);

  const statusRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.7, 0.08, 8, 48),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: atRisk ? 0.78 : 0.55 }),
  );
  statusRing.rotation.x = Math.PI / 2;
  group.add(statusRing);

  group.add(makeTextSprite(atRisk ? "AI DC RISK" : "AI DC", accent));
  return group;
}

function calculatePlanMetrics(
  orbitalPlanes: number,
  satellitesPerPlane: number,
  altitudeKm: AltitudePreset,
  priority: PlanPriority,
): PlanMetrics {
  const totalSatellites = orbitalPlanes * satellitesPerPlane;
  const launches = Math.ceil(totalSatellites / 6);
  const altitudeSolar = altitudeKm === 550 ? 94 : altitudeKm === 610 ? 91 : 88;
  const prioritySolar = priority === "solar" ? 3 : priority === "latency" ? -1 : -2;
  const priorityCoverage = priority === "latency" ? 7 : priority === "solar" ? 3 : -1;
  const altitudeCoverage = altitudeKm === 550 ? 4 : altitudeKm === 610 ? 2 : -2;

  return {
    totalSatellites,
    launches,
    launchCost: launches * LAUNCH_COST_USD,
    solarUptime: Math.min(98, Math.max(78, altitudeSolar + prioritySolar + Math.min(2, orbitalPlanes - 1))),
    coverageScore: Math.min(99, Math.round(58 + totalSatellites * 4.8 + priorityCoverage + altitudeCoverage)),
  };
}

function priorityLabel(priority: PlanPriority | PlannerRequest["constellation"]["priority"]) {
  return PRIORITIES.find((item) => item.id === priority)?.label ?? "Power margin";
}

function urgencyLabel(urgency: SchedulerUrgency) {
  return URGENCY_LEVELS.find((item) => item.id === urgency)?.label ?? "Priority";
}

function passToleranceLabel(tolerance: PassWindowTolerance) {
  return PASS_WINDOW_TOLERANCES.find((item) => item.id === tolerance)?.label ?? "Flexible";
}

function plannerSourceLabel(response: PlannerResponse | null) {
  if (!response) {
    return "Planner idle";
  }

  return response.source === "deepseek" ? "DeepSeek V4 Flash" : "Deterministic fallback";
}

function plannerSourceClass(response: PlannerResponse | null) {
  if (!response) {
    return "idle";
  }

  return response.source;
}

function sectionBadge(section: PlannerSection) {
  if (section.title === "Ground Comparison") {
    return "Modeled economics";
  }
  if (section.title === "Communication/Downlink Plan") {
    return "Modeled windows";
  }
  if (section.title === "Risk/Assumptions") {
    return "Guardrail";
  }
  if (section.title === "Next Action") {
    return "Ops step";
  }
  return null;
}

function workloadRoutingQuestion(workload: OrbitalWorkload) {
  if (workload.id === "auto") {
    return DEFAULT_QUESTION;
  }

  if (workload.id === "imagery") {
    return "Assign this incoming disaster-response imagery workload to the best moving LEO compute node for GCC triage and downlink.";
  }

  if (workload.id === "llm") {
    return "Evaluate this experimental LLM inference workload as a secondary queue on the moving LEO compute nodes.";
  }

  return `Assign this incoming ${workload.name.toLowerCase()} workload to the best moving LEO compute node for the GCC.`;
}

export function MissionControl({ country, logoTransitioning = false, onBackToGlobe }: MissionControlProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const plannerAbortRef = useRef<AbortController | null>(null);
  const plannerRequestIdRef = useRef(0);
  const stormVfxRef = useRef<SolarStormVfxHandle | null>(null);
  const stormAnimationFrameRef = useRef<number | null>(null);
  const stormLastFrameRef = useRef<number | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [activeMode, setActiveMode] = useState<MissionMode>("plan");
  const [selectedWorkloadId, setSelectedWorkloadId] = useState<OrbitalWorkload["id"]>("auto");
  const [orbitalPlanes, setOrbitalPlanes] = useState(2);
  const [satellitesPerPlane, setSatellitesPerPlane] = useState(3);
  const [altitudeKm, setAltitudeKm] = useState<AltitudePreset>(550);
  const [planPriority, setPlanPriority] = useState<PlanPriority>("solar");
  const [schedulerUrgency, setSchedulerUrgency] = useState<SchedulerUrgency>("priority");
  const [dataVolumeTb, setDataVolumeTb] = useState(42);
  const [deadlineMinutes, setDeadlineMinutes] = useState(45);
  const [passWindowTolerance, setPassWindowTolerance] = useState<PassWindowTolerance>("flex");
  const [workloadSplittable, setWorkloadSplittable] = useState(true);
  const [workloadCompressible, setWorkloadCompressible] = useState(true);
  const [workloadBufferable, setWorkloadBufferable] = useState(false);
  const [simulationOffsetHours, setSimulationOffsetHours] = useState(0);
  const [simulationPlaying, setSimulationPlaying] = useState(false);
  const [stormActive, setStormActive] = useState(false);
  const [missionActive, setMissionActive] = useState(false);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [thinking, setThinking] = useState(false);
  const [plannerResponse, setPlannerResponse] = useState<PlannerResponse | null>(null);
  const [lastPlannerQuestion, setLastPlannerQuestion] = useState("");
  const [lastPlannerRequest, setLastPlannerRequest] = useState<PlannerRequest | null>(null);
  const [lastSchedulerSnapshot, setLastSchedulerSnapshot] = useState<SchedulerSnapshot | null>(null);
  const [planWindowOpen, setPlanWindowOpen] = useState(false);
  const [selectedSatelliteId, setSelectedSatelliteId] = useState("compute-a");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [spaceWeatherScenario, setSpaceWeatherScenario] = useState<SpaceWeatherScenario>(() => getCachedSpaceWeatherScenario());
  const { width, height } = useWindowSize();

  const selectedWorkload = useMemo(
    () => orbitalWorkloads.find((workload) => workload.id === selectedWorkloadId) ?? orbitalWorkloads[0],
    [selectedWorkloadId],
  );
  const simulationDate = useMemo(
    () => new Date(DEMO_ORBIT_START + simulationOffsetHours * 60 * 60 * 1000),
    [simulationOffsetHours],
  );
  const planComputeDate = useMemo(() => new Date(DEMO_ORBIT_START), []);
  const starlinkPropagationDate = activeMode === "simulate" ? simulationDate : clock;
  const computePropagationDate = activeMode === "simulate" ? simulationDate : planComputeDate;
  const planMetrics = useMemo(
    () => calculatePlanMetrics(orbitalPlanes, satellitesPerPlane, altitudeKm, planPriority),
    [altitudeKm, orbitalPlanes, planPriority, satellitesPerPlane],
  );
  const trackedSatellites = useMemo(() => createTrackedSatellites(cachedStarlinkTles), []);
  const starlinkPoints = useMemo(
    () => propagateTrackedSatellites(trackedSatellites, starlinkPropagationDate),
    [starlinkPropagationDate, trackedSatellites],
  );
  const computePoints = useMemo(
    () => computeSatellites.map((satellite) => projectComputeSatellite(satellite, computePropagationDate)),
    [computePropagationDate],
  );
  const schedulerSnapshot = useMemo(
    () => ({
      urgency: schedulerUrgency,
      dataVolumeTb,
      deadlineMinutes,
      passWindowTolerance,
      splittable: workloadSplittable,
      compressible: workloadCompressible,
      bufferable: workloadBufferable,
      priority: planPriority,
      leoNodeCount: computeSatellites.length,
    }),
    [
      dataVolumeTb,
      deadlineMinutes,
      passWindowTolerance,
      planPriority,
      schedulerUrgency,
      workloadBufferable,
      workloadCompressible,
      workloadSplittable,
    ],
  );
  const groundPoints = useMemo(() => groundStationPoints(groundStations), []);
  const allPoints = useMemo(
    () => [...starlinkPoints, ...groundPoints],
    [groundPoints, starlinkPoints],
  );
  const downlinkArcs = useMemo(
    () => buildDownlinkArcs(computePoints, groundStations, missionActive || activeMode === "simulate", stormActive),
    [activeMode, computePoints, missionActive, stormActive],
  );
  const sunSyncPath = useMemo(() => [{ id: "sun-sync-slot", points: buildSunSyncPath() }], []);
  const comparison = useMemo(
    () => compareOrbitalToTerrestrial(computeSatellites, selectedWorkload),
    [selectedWorkload],
  );
  const createPlannerRequest = (plannerQuestion: string): PlannerRequest => ({
    question: plannerQuestion,
    country,
    workload: {
      id: selectedWorkload.id,
      name: selectedWorkload.name,
      requiredPowerKw: selectedWorkload.requiredPowerKw,
      latencySensitive: selectedWorkload.latencySensitive,
      description: selectedWorkload.description,
      target: selectedWorkload.target,
    },
    constellation: {
      orbitalPlanes,
      satellitesPerPlane,
      altitudeKm,
      priority: planPriority,
    },
    metrics: planMetrics,
    comparison,
    computeSatellites: computeSatellites.map((satellite) => ({
      id: satellite.id,
      name: satellite.name,
      orbitName: satellite.orbitName,
      altitudeKm: satellite.altitudeKm,
      inclinationDeg: satellite.inclinationDeg,
      gpuType: satellite.gpuType,
      powerKw: satellite.powerKw,
      thermalCapacityKw: satellite.thermalCapacityKw,
      sunlightPercent: satellite.sunlightPercent,
      massKg: satellite.massKg,
      health: {
        thermalLoadPercent: satellite.health.thermalLoadPercent,
        thermalMarginKw: satellite.health.thermalMarginKw,
        computeLoadPercent: satellite.health.computeLoadPercent,
        computeHeadroomPercent: satellite.health.computeHeadroomPercent,
        queueLoadPercent: satellite.health.queueLoadPercent,
        radiationRiskPercent: satellite.health.radiationRiskPercent,
        linkQualityPercent: satellite.health.linkQualityPercent,
        linkReady: satellite.health.linkReady,
      },
    })),
    groundStations: groundStations.map((station) => ({
      id: station.id,
      name: station.name,
      city: station.city,
      lat: station.lat,
      lng: station.lng,
      bandwidthGbps: station.bandwidthGbps,
    })),
    scheduler: schedulerSnapshot,
    routeAssignment: orbitalRouteAssignment
      ? {
          recommendedSatelliteId: orbitalRouteAssignment.recommendedNode.satellite.id,
          recommendedSatelliteName: orbitalRouteAssignment.recommendedNode.satellite.name,
          backupSatelliteId: orbitalRouteAssignment.backupNode?.satellite.id,
          backupSatelliteName: orbitalRouteAssignment.backupNode?.satellite.name,
          degradedSatelliteIds: orbitalRouteAssignment.degradedNodes.map((node) => node.satellite.id),
          selectedGroundStationId: orbitalRouteAssignment.selectedGroundStation.id,
          selectedGroundStationCity: orbitalRouteAssignment.selectedGroundStation.city,
          backupGroundStationId: orbitalRouteAssignment.backupGroundStation?.id,
          backupGroundStationCity: orbitalRouteAssignment.backupGroundStation?.city,
          routeScore: orbitalRouteAssignment.routeScore,
          status: orbitalRouteAssignment.status,
          mode: orbitalRouteAssignment.mode,
          actions: orbitalRouteAssignment.actions,
          estimatedNextHandoffMinutes: orbitalRouteAssignment.estimatedNextHandoffMinutes,
          reasons: orbitalRouteAssignment.reasons,
          riskNotes: orbitalRouteAssignment.riskNotes,
        }
      : null,
  });
  const selectedSatellite = computeSatellites.find((satellite) => satellite.id === selectedSatelliteId) ?? computeSatellites[0];
  const rankedComputeSatellites = useMemo(
    () => rankComputeSatellitesForWorkload(computeSatellites, selectedWorkload),
    [selectedWorkload],
  );
  const orbitalRouteAssignment = useMemo(
    () =>
      buildOrbitalRouteAssignment({
        computePoints,
        groundStations,
        rankedComputeSatellites,
        workload: selectedWorkload,
        constraints: schedulerSnapshot,
        stormActive,
      }),
    [computePoints, rankedComputeSatellites, schedulerSnapshot, selectedWorkload, stormActive],
  );
  const routeArcs = useMemo<DownlinkArc[]>(() => {
    if (!orbitalRouteAssignment) {
      return [];
    }

    return orbitalRouteAssignment.paths.map((path) => {
      const degraded = orbitalRouteAssignment.degradedNodes.some((node) => node.satellite.id === path.satelliteId);
      const colors =
        path.kind === "migration"
          ? ["rgba(239, 68, 68, 0.92)", "rgba(52, 211, 153, 0.9)"]
          : degraded
            ? ["rgba(239, 68, 68, 0.92)", "rgba(245, 184, 75, 0.84)"]
            : path.kind === "backup"
              ? ["rgba(245, 184, 75, 0.86)", "rgba(34, 211, 238, 0.82)"]
              : ["rgba(52, 211, 153, 0.94)", "rgba(54, 242, 192, 0.88)"];

      return {
        id: path.id,
        satelliteId: path.satelliteId,
        groundStationId: path.groundStationId,
        startLat: path.startLat,
        startLng: path.startLng,
        startAlt: path.startAlt,
        endLat: path.endLat,
        endLng: path.endLng,
        endAlt: path.endAlt,
        color: colors,
        label: path.label,
      };
    });
  }, [orbitalRouteAssignment]);
  const visibleDownlinkArcs = activeMode === "plan" ? routeArcs : downlinkArcs;
  const activePlannerRequest = lastPlannerRequest ?? createPlannerRequest(question.trim() || DEFAULT_QUESTION);
  const activeSchedulerSnapshot = lastSchedulerSnapshot ?? schedulerSnapshot;
  const activePlannerQuestion = lastPlannerQuestion || activePlannerRequest.question;
  const planWindowAvailable = Boolean(plannerResponse);
  const quickPlannerActions = [
    {
      label: "Pick best node",
      question: `Select the best moving LEO compute node for the incoming ${selectedWorkload.name.toLowerCase()} workload and explain the assignment.`,
    },
    {
      label: "Compare paths",
      question: `Compare the current LEO compute paths for ${selectedWorkload.name.toLowerCase()} using power margin, sunlight, and downlink timing.`,
    },
    {
      label: "Explain risks",
      question: `Explain the highest-risk assumptions when routing this ${selectedWorkload.name.toLowerCase()} workload through moving LEO compute nodes.`,
    },
    {
      label: "Ops summary",
      question: `Write a concise operations summary for assigning this ${selectedWorkload.name.toLowerCase()} workload to Photonix LEO compute.`,
    },
  ];
  const selectedRanking =
    rankedComputeSatellites.find((item) => item.satellite.id === selectedSatellite.id) ?? rankedComputeSatellites[0];
  const selectedRouteRole = routeRoleForSatellite(orbitalRouteAssignment, selectedSatellite.id) ?? selectedRanking?.role ?? null;
  const selectedComputePoint =
    computePoints.find((point) => point.id === selectedSatellite.id) ??
    projectComputeSatellite(selectedSatellite, computePropagationDate);
  const nodePositionLabel = activeMode === "simulate" ? "Sim" : "Live";
  const operationalPlaybook = useMemo(
    () => buildOperationalPlaybook(stormActive, orbitalRouteAssignment, selectedWorkload),
    [orbitalRouteAssignment, selectedWorkload, stormActive],
  );
  const activeCompute = missionActive || activeMode === "simulate"
    ? computeSatellites.slice(0, selectedWorkload.id === "training" || selectedWorkload.id === "auto" ? 3 : 2)
    : [];
  const spaceWeatherModeLabel = spaceWeatherScenario.mode === "live" ? "Live NASA" : "Cached NASA";
  const spaceWeatherSourceLabel = `${spaceWeatherScenario.provider} ${spaceWeatherScenario.mode === "live" ? "live feed" : "scenario"}`;

  const globeWidth = width;
  const globeHeight = height;

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!simulationPlaying || activeMode !== "simulate") {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setSimulationOffsetHours((current) => (current >= 24 ? 0 : current + 1));
    }, 520);

    return () => window.clearInterval(interval);
  }, [activeMode, simulationPlaying]);

  useEffect(() => {
    if (activeMode !== "simulate") {
      setSimulationPlaying(false);
    }
  }, [activeMode]);

  useEffect(() => {
    let active = true;

    void loadSpaceWeatherScenario(import.meta.env.VITE_NASA_API_KEY).then((scenario) => {
      if (active) {
        setSpaceWeatherScenario(scenario);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      globeRef.current?.pointOfView(SAUDI_VIEW, 1200);
      const controls = globeRef.current?.controls();
      if (controls) {
        controls.autoRotate = false;
        controls.autoRotateSpeed = 0.12;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    globeRef.current?.pointOfView(
      sidebarOpen
        ? { lat: 24.4, lng: 49.2, altitude: 1.52 }
        : SAUDI_VIEW,
      760,
    );
  }, [sidebarOpen]);

  useEffect(() => {
    return () => {
      plannerAbortRef.current?.abort();
      if (stormAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(stormAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!planWindowOpen) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlanWindowOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [planWindowOpen]);

  useEffect(() => {
    if (stormAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(stormAnimationFrameRef.current);
      stormAnimationFrameRef.current = null;
    }
    stormLastFrameRef.current = null;

    const existingVfx = stormVfxRef.current;
    if (existingVfx) {
      existingVfx.dispose();
      stormVfxRef.current = null;
    }

    if (!stormActive || activeMode !== "simulate") {
      return undefined;
    }

    const globe = globeRef.current;
    const scene = globe?.scene();
    if (!globe || !scene) {
      return undefined;
    }

    const atRiskPoint = computePoints.find((point) => point.id === "compute-b") ?? computePoints[1] ?? computePoints[0];
    const stormVfx = createSolarStormVfx({
      start: globeVector(globe, 4, -48, 0.96),
      end: globeVector(globe, 28, 82, 0.5),
      impact: globeVector(globe, atRiskPoint.lat, atRiskPoint.lng, atRiskPoint.altitude + 0.2),
      intensity: spaceWeatherScenario.intensity,
    });

    scene.add(stormVfx.group);
    stormVfxRef.current = stormVfx;

    const animateStorm = (frameTime: number) => {
      const lastFrame = stormLastFrameRef.current ?? frameTime;
      stormLastFrameRef.current = frameTime;
      stormVfx.update(Math.min(0.05, (frameTime - lastFrame) / 1000));
      stormAnimationFrameRef.current = window.requestAnimationFrame(animateStorm);
    };

    stormAnimationFrameRef.current = window.requestAnimationFrame(animateStorm);

    return () => {
      if (stormAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(stormAnimationFrameRef.current);
        stormAnimationFrameRef.current = null;
      }
      stormLastFrameRef.current = null;
      if (stormVfxRef.current === stormVfx) {
        stormVfxRef.current = null;
      }
      stormVfx.dispose();
    };
  }, [activeMode, stormActive, spaceWeatherScenario.intensity]);

  useEffect(() => {
    const globe = globeRef.current;
    const stormVfx = stormVfxRef.current;
    if (!stormActive || !globe || !stormVfx) {
      return;
    }

    const atRiskPoint = computePoints.find((point) => point.id === "compute-b") ?? computePoints[1] ?? computePoints[0];
    stormVfx.setImpactPosition(globeVector(globe, atRiskPoint.lat, atRiskPoint.lng, atRiskPoint.altitude + 0.2));
  }, [computePoints, stormActive]);

  const schedulerBehaviorSummary = (snapshot: SchedulerSnapshot) => [
    snapshot.splittable ? "splittable" : "atomic",
    snapshot.compressible ? "compressible" : "raw",
    snapshot.bufferable ? "bufferable" : "live handoff",
  ].join(" / ");

  const withSchedulerContext = (plannerQuestion: string, snapshot: SchedulerSnapshot) =>
    `${plannerQuestion}\n\nOperational scheduler constraints: ${urgencyLabel(snapshot.urgency)} urgency, ${snapshot.dataVolumeTb} TB input, ${snapshot.deadlineMinutes} minute deadline, ${passToleranceLabel(snapshot.passWindowTolerance).toLowerCase()} pass-window tolerance, ${schedulerBehaviorSummary(snapshot)} workload behavior, ${priorityLabel(snapshot.priority).toLowerCase()} route priority, and ${snapshot.leoNodeCount} active LEO compute nodes.`;

  const runPlanner = (overrideQuestion?: string, schedulerOverride = schedulerSnapshot) => {
    const trimmedQuestion = overrideQuestion?.trim() || question.trim() || DEFAULT_QUESTION;
    const requestBody = createPlannerRequest(withSchedulerContext(trimmedQuestion, schedulerOverride));
    const requestId = plannerRequestIdRef.current + 1;
    const controller = new AbortController();

    plannerRequestIdRef.current = requestId;
    plannerAbortRef.current?.abort();
    plannerAbortRef.current = controller;

    setMissionActive(true);
    setThinking(true);
    setPlannerResponse(null);
    setPlanWindowOpen(false);
    setLastPlannerQuestion(trimmedQuestion);
    setLastPlannerRequest(requestBody);
    setLastSchedulerSnapshot(schedulerOverride);
    setSidebarOpen(true);
    setSelectedSatelliteId("compute-a");
    globeRef.current?.pointOfView({ lat: 24.8, lng: 50.2, altitude: 1.38 }, 1100);

    void (async () => {
      try {
        const response = await fetch("/api/planner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Planner endpoint returned ${response.status}.`);
        }

        const validation = validatePlannerResponse(await response.json());
        if (!validation.ok) {
          throw new Error(validation.error);
        }

        if (plannerRequestIdRef.current === requestId) {
          setPlannerResponse(validation.value);
          setPlanWindowOpen(true);
        }
      } catch (error) {
        if (plannerRequestIdRef.current === requestId && !controller.signal.aborted) {
          const reason = error instanceof Error ? error.message : "Unknown planner error.";
          setPlannerResponse(
            buildFallbackPlannerResponse(requestBody, [
              `DeepSeek planner unavailable or invalid; deterministic fallback shown. ${reason}`,
            ]),
          );
          setPlanWindowOpen(true);
        }
      } finally {
        if (plannerRequestIdRef.current === requestId) {
          setThinking(false);
        }
      }
    })();
  };

  const runAutoQueueScenario = () => {
    const demoSchedulerSnapshot: SchedulerSnapshot = {
      urgency: "priority",
      dataVolumeTb: 42,
      deadlineMinutes: 45,
      passWindowTolerance: "flex",
      splittable: true,
      compressible: true,
      bufferable: false,
      priority: "solar",
      leoNodeCount: computeSatellites.length,
    };

    setActiveMode("plan");
    setSelectedWorkloadId("auto");
    setOrbitalPlanes(2);
    setSatellitesPerPlane(3);
    setAltitudeKm(550);
    setPlanPriority("solar");
    setSchedulerUrgency(demoSchedulerSnapshot.urgency);
    setDataVolumeTb(demoSchedulerSnapshot.dataVolumeTb);
    setDeadlineMinutes(demoSchedulerSnapshot.deadlineMinutes);
    setPassWindowTolerance(demoSchedulerSnapshot.passWindowTolerance);
    setWorkloadSplittable(demoSchedulerSnapshot.splittable);
    setWorkloadCompressible(demoSchedulerSnapshot.compressible);
    setWorkloadBufferable(demoSchedulerSnapshot.bufferable);
    setQuestion(DEFAULT_QUESTION);
    runPlanner(DEFAULT_QUESTION, demoSchedulerSnapshot);
  };

  const pointLabel = (point: object) => {
    const item = point as OrbitPoint;
    if (item.kind === "compute" && item.satellite) {
      return `${item.name}<br/>${item.satellite.orbitName}<br/>${item.satellite.powerKw} kW ${item.satellite.gpuType}`;
    }
    if (item.kind === "ground") {
      return `${item.name}<br/>${item.bandwidthGbps?.toFixed(1)} Gbps downlink`;
    }
    return `${item.name}<br/>Cached CelesTrak Starlink TLE track`;
  };

  return (
    <main
      className={`mission-control min-h-screen bg-[#02060b] text-white ${activeMode === "plan" ? "is-plan-mode" : "is-sim-mode"} ${
        sidebarOpen ? "is-drawer-open" : ""
      } ${
        logoTransitioning ? "is-logo-transitioning" : ""
      } ${activeMode === "simulate" ? "is-simulating" : ""} ${simulationPlaying ? "is-simulation-running" : ""} ${
        stormActive ? "is-storm-active" : ""
      }`}
    >
      <section className="mission-layout min-h-screen">
        <div className="mission-stage relative">
          <button
            type="button"
            onClick={onBackToGlobe}
            className="mission-back mission-page-back inline-flex h-10 w-10 items-center justify-center"
            aria-label="Back to landing page"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="mission-topbar pointer-events-none absolute z-20">
            <div className="mission-brand-panel pointer-events-auto">
              <img
                src="/assets/photonix-logo-no-bg-trimmed.png"
                alt="Photonix"
                className="mission-logo"
              />
            </div>
          </div>
          <div className="mission-clock hidden text-right md:block">
            <span>{clock.toLocaleTimeString("en-US", { hour12: false })}</span>
            <small>Live propagation</small>
          </div>

          <Globe
            ref={globeRef}
            width={globeWidth}
            height={globeHeight}
            globeOffset={
              width >= 1120
                ? sidebarOpen
                  ? [-260, 0]
                  : [230, 0]
                : [0, 0]
            }
            globeImageUrl={GLOBE_IMAGE_URL}
            backgroundImageUrl={BACKGROUND_IMAGE_URL}
            backgroundColor="#02060b"
            pointsData={allPoints}
            pointLat={(point) => (point as OrbitPoint).lat}
            pointLng={(point) => (point as OrbitPoint).lng}
            pointAltitude={(point) => (point as OrbitPoint).altitude}
            pointColor={(point) => {
              const item = point as OrbitPoint;
              if (stormActive && item.kind === "compute" && item.id === "compute-b") {
                return "#ef4444";
              }
              if (stormActive && item.kind === "compute" && item.id === "compute-a") {
                return "#34d399";
              }
              if (item.kind === "compute" && activeCompute.some((satellite) => satellite.id === item.id)) {
                return "#ffd166";
              }
              return item.color;
            }}
            pointRadius={(point) => (point as OrbitPoint).radius}
            pointResolution={10}
            pointsTransitionDuration={800}
            pointLabel={pointLabel}
            onPointClick={(point) => {
              const item = point as OrbitPoint;
              if (item.kind === "compute") {
                setSelectedSatelliteId(item.id);
              }
            }}
            arcsData={visibleDownlinkArcs}
            arcStartLat={(arc: object) => (arc as DownlinkArc).startLat}
            arcStartLng={(arc: object) => (arc as DownlinkArc).startLng}
            arcStartAltitude={(arc: object) => (arc as DownlinkArc).startAlt}
            arcEndLat={(arc: object) => (arc as DownlinkArc).endLat}
            arcEndLng={(arc: object) => (arc as DownlinkArc).endLng}
            arcEndAltitude={(arc: object) => (arc as DownlinkArc).endAlt}
            arcColor={(arc: object) => (arc as DownlinkArc).color}
            arcDashLength={0.34}
            arcDashGap={0.22}
            arcDashAnimateTime={1200}
            arcStroke={0.64}
            arcAltitude={0.18}
            arcLabel={(arc: object) => (arc as DownlinkArc).label}
            pathsData={missionActive || activeMode === "simulate" ? sunSyncPath : []}
            pathPoints="points"
            pathPointLat="lat"
            pathPointLng="lng"
            pathPointAlt="alt"
            pathColor={() => "rgba(34, 211, 238, 0.78)"}
            pathStroke={1.7}
            pathDashLength={0.05}
            pathDashGap={0.018}
            pathDashAnimateTime={3200}
            atmosphereColor="#9bdfff"
            atmosphereAltitude={0.22}
            rendererConfig={{ antialias: true, alpha: true }}
            objectsData={computePoints}
            objectLat={(point) => (point as OrbitPoint).lat}
            objectLng={(point) => (point as OrbitPoint).lng}
            objectAltitude={(point) => (point as OrbitPoint).altitude + 0.08}
            objectFacesSurfaces
            objectThreeObject={(point) => {
              const item = point as OrbitPoint;
              return createOrbitalDataCenterModel(item, stormActive, item.id === selectedSatelliteId);
            }}
            objectLabel={(point) => {
              const item = point as OrbitPoint;
              return `${item.name}<br/>Moving LEO AI data center<br/>${formatCoordinate(item.lat, "lat")} / ${formatCoordinate(item.lng, "lng")}<br/>${item.satellite?.gpuType ?? "GPU"} compute node`;
            }}
            onObjectClick={(point) => {
              const item = point as OrbitPoint;
              setSelectedSatelliteId(item.id);
            }}
          />

          <div className="mission-stage-shade pointer-events-none absolute inset-0" />
          {activeMode === "simulate" && (
            <div className="simulation-visual-layer pointer-events-none absolute inset-0" aria-hidden="true">
              {simulationPlaying && (
                <div className="time-sweep">
                  <span>24h time sweep</span>
                </div>
              )}
              {stormActive && (
                <div className="storm-event-label">
                  <span>{spaceWeatherScenario.mode === "live" ? "Live DONKI CME event" : "Cached DONKI CME event"}</span>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="mission-demo-cta absolute z-20"
            onClick={runAutoQueueScenario}
          >
            <Sparkles size={15} />
            Route job queue
          </button>
          {(thinking || planWindowAvailable) && (
            <button
              type="button"
              className={`plan-float-button absolute z-20 ${planWindowAvailable ? "is-ready" : "is-loading"}`}
              onClick={() => {
                if (plannerResponse) {
                  setPlanWindowOpen(true);
                }
              }}
              disabled={!plannerResponse}
              aria-label={plannerResponse ? "Open generated mission plan" : "Mission plan is generating"}
            >
              {plannerResponse ? <Maximize2 size={16} /> : <span aria-hidden="true" />}
              <strong>{plannerResponse ? "View plan" : "Generating plan"}</strong>
              {plannerResponse && <small>{plannerResponse.confidence} confidence</small>}
            </button>
          )}
          <div className="mission-telemetry absolute bottom-5 left-5 right-5 z-20 grid gap-3 sm:grid-cols-3">
            <Telemetry
              icon={<Satellite size={16} />}
              label={activeMode === "simulate" ? "Simulation time" : "Queue volume"}
              value={activeMode === "simulate" ? `+${simulationOffsetHours}h` : `${schedulerSnapshot.dataVolumeTb} TB`}
            />
            <Telemetry
              icon={<RadioTower size={16} />}
              label={activeMode === "simulate" ? "Ops state" : "Queue SLA"}
              value={activeMode === "simulate" ? (stormActive ? "CME event" : "Nominal") : `${schedulerSnapshot.deadlineMinutes} min SLA`}
            />
            <Telemetry
              icon={<Sun size={16} />}
              label={activeMode === "simulate" ? "Workload routing" : "Route priority"}
              value={activeMode === "simulate" ? (stormActive ? "Migrated" : "Primary") : priorityLabel(schedulerSnapshot.priority)}
            />
          </div>
        </div>

        <button
          type="button"
          className={`mission-drawer-toggle ${sidebarOpen ? "is-open" : ""}`}
          onClick={() => setSidebarOpen((current) => !current)}
          aria-label={sidebarOpen ? "Close mission controls" : "Open mission controls"}
        >
          {sidebarOpen ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
          <span>{sidebarOpen ? "Hide" : activeMode === "simulate" ? "Sim" : "Plan"}</span>
        </button>

        <aside className={`mission-panel ${activeMode === "plan" ? "is-plan-drawer" : "is-sim-drawer"} ${sidebarOpen ? "is-open" : ""}`}>
          <div className="mission-panel-header">
            <span>Mission controls</span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close mission controls"
            >
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="mission-mode-switch" role="tablist" aria-label="Mission control mode">
            <button
              type="button"
              className={activeMode === "plan" ? "is-selected" : ""}
              onClick={() => {
                setActiveMode("plan");
                setStormActive(false);
              }}
            >
              Plan
            </button>
            <button
              type="button"
              className={activeMode === "simulate" ? "is-selected" : ""}
              onClick={() => setActiveMode("simulate")}
            >
              Simulate
            </button>
          </div>

          {activeMode === "plan" ? (
            <>
              <section className="mission-card">
                <div className="mission-card-title">
                  <DatabaseZap size={17} />
                  Workload
                </div>
                <div className="workload-grid">
                  {orbitalWorkloads.map((workload) => (
                    <button
                      key={workload.id}
                      type="button"
                      onClick={() => {
                        setSelectedWorkloadId(workload.id);
                        setQuestion(workloadRoutingQuestion(workload));
                      }}
                      className={`workload-option ${workload.id === selectedWorkloadId ? "is-selected" : ""}`}
                    >
                      <span>{workload.name}</span>
                      <small>{workload.id === "auto" ? "job constraints" : `${workload.requiredPowerKw} kW target`}</small>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{selectedWorkload.description}</p>
              </section>

              <section className="mission-card mission-plan-card">
                <div className="mission-card-title planner-title-row">
                  <Bot size={17} />
                  AI Mission Planner
                  <span className={`planner-source-badge is-${plannerSourceClass(plannerResponse)}`}>
                    {plannerSourceLabel(plannerResponse)}
                  </span>
                </div>
                <form
                  className="planner-command-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    runPlanner();
                  }}
                >
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={3}
                    className="mission-input"
                    aria-label="Mission planner question"
                  />
                  <div className="planner-quick-actions" aria-label="Planner quick actions">
                    {quickPlannerActions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => {
                          setQuestion(action.question);
                          runPlanner(action.question);
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className={`mission-send ${plannerResponse && !thinking ? "is-generated" : ""}`}
                    aria-label="Ask mission planner"
                  >
                    <Send size={16} />
                    {plannerResponse && !thinking ? "Regenerate Mission Plan" : "Generate Mission Plan"}
                  </button>
                </form>

                <div className="planner-config-strip" aria-label="Planner config snapshot">
                  <PlannerChip label="Workload" value={activePlannerRequest.workload.name} />
                  <PlannerChip label="Volume" value={`${activeSchedulerSnapshot.dataVolumeTb} TB`} />
                  <PlannerChip label="Deadline" value={`${activeSchedulerSnapshot.deadlineMinutes} min`} />
                  <PlannerChip label="Priority" value={priorityLabel(activeSchedulerSnapshot.priority)} />
                  <PlannerChip label="Tolerance" value={passToleranceLabel(activeSchedulerSnapshot.passWindowTolerance)} />
                  <PlannerChip label="LEO nodes" value={`${activeSchedulerSnapshot.leoNodeCount}`} />
                </div>

                {thinking && (
                  <div className="planner-processing" aria-live="polite">
                    <span />
                    Generating mission plan...
                  </div>
                )}

                {!thinking && plannerResponse && (
                  <div className="mission-plan-output is-compact">
                    <button type="button" className="planner-open-button" onClick={() => setPlanWindowOpen(true)}>
                      <Maximize2 size={16} />
                      View Full Plan
                    </button>
                  </div>
                )}

                {!thinking && !plannerResponse && (
                  <div className="planner-empty-state">
                    <strong>Planner ready</strong>
                    <p>Generate a routing recommendation from the selected job queue, modeled constraints, and active LEO node set.</p>
                  </div>
                )}
              </section>

              <section className="mission-card">
                <div className="mission-card-title">
                  <Cpu size={17} />
                  Orbital AI Data Centers
                </div>
                <div className="satellite-list">
                  {rankedComputeSatellites.map((ranking) => {
                    const { satellite } = ranking;
                    const selected = satellite.id === selectedSatellite.id;
                    const health = satellite.health;
                    const routeRole = routeRoleForSatellite(orbitalRouteAssignment, satellite.id) ?? ranking.role;
                    return (
                      <button
                        key={satellite.id}
                        type="button"
                        className={`satellite-row ${selected ? "is-selected" : ""}`}
                        onClick={() => setSelectedSatelliteId(satellite.id)}
                      >
                        <span>
                          <strong>{satellite.name}</strong>
                          <small>{satellite.gpuType} / {satellite.orbitName}</small>
                          <small className="satellite-row-health">
                            Score {ranking.score} / T {health.thermalLoadPercent}% / Q {health.queueLoadPercent}% / Link {health.linkQualityPercent}%
                          </small>
                        </span>
                        <em className={routingRoleClass(routeRole)}>#{ranking.rank} {routingRoleLabel(routeRole)}</em>
                      </button>
                    );
                  })}
                </div>
                <div className="spec-grid">
                  <Spec
                    label="Routing rank"
                    value={selectedRanking ? `#${selectedRanking.rank} ${routingRoleLabel(selectedRanking.role)}` : "N/A"}
                  />
                  <Spec label="Active route role" value={selectedRouteRole ? routingRoleLabel(selectedRouteRole) : "N/A"} />
                  <Spec label="Health score" value={selectedRanking ? `${selectedRanking.score}/100` : "N/A"} />
                  <Spec label="Power" value={`${selectedSatellite.powerKw} kW`} />
                  <Spec label="Thermal" value={`${selectedSatellite.thermalCapacityKw} kW`} />
                  <Spec label="Power margin" value={selectedRanking ? `${selectedRanking.powerMarginKw} kW` : "N/A"} />
                  <Spec label="Thermal margin" value={selectedRanking ? `${selectedRanking.thermalMarginKw} kW` : "N/A"} />
                  <Spec label="Battery" value={`${selectedSatellite.health.batteryPercent}%`} />
                  <Spec label="Compute headroom" value={`${selectedSatellite.health.computeHeadroomPercent}%`} />
                  <Spec label="Queue load" value={`${selectedSatellite.health.queueLoadPercent}%`} />
                  <Spec label="Radiation risk" value={`${selectedSatellite.health.radiationRiskPercent}%`} />
                  <Spec label="Link quality" value={`${selectedSatellite.health.linkQualityPercent}%`} />
                  <Spec label="Link state" value={selectedSatellite.health.linkReady ? "Ready" : "Standby"} />
                  <Spec label="Sunlight" value={`${selectedSatellite.sunlightPercent}%`} />
                  <Spec label="Inclination" value={`${selectedSatellite.inclinationDeg} deg`} />
                  <Spec label={`${nodePositionLabel} lat`} value={formatCoordinate(selectedComputePoint.lat, "lat")} />
                  <Spec label={`${nodePositionLabel} lng`} value={formatCoordinate(selectedComputePoint.lng, "lng")} />
                </div>
              </section>

              <section className="mission-card">
                <div className="mission-card-title">
                  <Waves size={17} />
                  Terrestrial Comparison
                </div>
                <div className="comparison-grid">
                  <Metric label="Orbital power" value={`${comparison.orbitalPowerKw} kW`} />
                  <Metric label="Orbital monthly" value={formatCurrency(comparison.orbitalMonthlyCost)} />
                  <Metric label="Ground equivalent" value={`${comparison.terrestrialMw.toFixed(1)} MW`} />
                  <Metric label="Ground monthly" value={formatCurrency(comparison.terrestrialMonthlyCost)} />
                </div>
                <div className="impact-strip">
                  <span>Water avoided</span>
                  <strong>{formatNumber(comparison.terrestrialWaterLitersDay)} L/day</strong>
                </div>
                <div className="impact-strip">
                  <span>Carbon avoided</span>
                  <strong>{formatNumber(comparison.carbonSavingsKgDay)} kg/day</strong>
                </div>
              </section>

              <section className="mission-card compact">
                <div className="mission-card-title">
                  <Orbit size={17} />
                  Downlink Windows
                </div>
                <div className="timeline-list">
                  {orbitalRouteAssignment?.paths.slice(0, 3).map((path) => {
                    const station = groundStations.find((item) => item.id === path.groundStationId);
                    return (
                      <Timeline
                        key={path.id}
                        city={station?.city ?? path.groundStationId}
                        next={`${path.estimatedHandoffMinutes} min`}
                        duration={`${Math.max(4, Math.round(path.visibilityScore / 14))} min`}
                        active={path.kind === "primary" || missionActive}
                      />
                    );
                  })}
                  {!orbitalRouteAssignment && (
                    <>
                      <Timeline city="Riyadh" next="14 min" duration="8 min" active={missionActive} />
                      <Timeline city="Dubai" next="18 min" duration="7 min" active={missionActive} />
                      <Timeline city="Abu Dhabi" next="21 min" duration="6 min" active={missionActive} />
                    </>
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="mission-card">
                <div className="mission-card-title">
                  <Clock3 size={17} />
                  24h Simulation
                </div>
                <div className="simulation-readout">
                  <strong>+{simulationOffsetHours}h</strong>
                  <span>{simulationDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={simulationOffsetHours}
                  onChange={(event) => setSimulationOffsetHours(Number(event.target.value))}
                  className="simulation-range"
                  aria-label="Simulation time offset"
                />
                <div className="range-markers">
                  <span>+0h</span>
                  <span>+12h</span>
                  <span>+24h</span>
                </div>
                <div className="simulation-stepper">
                  <button
                    type="button"
                    onClick={() => setSimulationOffsetHours((current) => Math.max(0, current - 1))}
                  >
                    -1h
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulationOffsetHours(12)}
                  >
                    Set +12h
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulationOffsetHours((current) => Math.min(24, current + 1))}
                  >
                    +1h
                  </button>
                </div>
                <button
                  type="button"
                  className={`simulation-play-button ${simulationPlaying ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveMode("simulate");
                    setSimulationPlaying((current) => !current);
                  }}
                >
                  {simulationPlaying ? <Pause size={15} /> : <Play size={15} />}
                  {simulationPlaying ? "Pause 24h sweep" : "Run 24h sweep"}
                </button>
                <button
                  type="button"
                  className={`mission-storm-button ${stormActive ? "is-active" : ""}`}
                  onClick={() => {
                    setMissionActive(true);
                    setStormActive((current) => !current);
                    setSelectedSatelliteId(stormActive ? "compute-a" : "compute-b");
                  }}
                >
                  <AlertTriangle size={16} />
                  {stormActive ? "Reset Event" : "Trigger CME Event"}
                </button>
              </section>

              <section className="mission-card compact">
                <div className="mission-card-title mission-card-title-with-badge">
                  <Sun size={17} />
                  Space Weather Event
                  <span className={`space-weather-badge is-${spaceWeatherScenario.mode}`}>{spaceWeatherModeLabel}</span>
                </div>
                <div className="space-weather-summary">
                  <strong>{spaceWeatherScenario.title}</strong>
                  <span>{spaceWeatherSourceLabel} / {formatSeverity(spaceWeatherScenario)}</span>
                </div>
                <div className="spec-grid space-weather-grid">
                  <Spec label="Flare" value={spaceWeatherScenario.flare?.classType ?? "N/A"} />
                  <Spec label="Peak" value={formatUtcTime(spaceWeatherScenario.flare?.peakTime)} />
                  <Spec
                    label="Source"
                    value={
                      spaceWeatherScenario.flare?.sourceLocation
                        ? `${spaceWeatherScenario.flare.sourceLocation}${spaceWeatherScenario.flare.activeRegionNum ? ` / AR ${spaceWeatherScenario.flare.activeRegionNum}` : ""}`
                        : "N/A"
                    }
                  />
                  <Spec
                    label="CME speed"
                    value={spaceWeatherScenario.cme?.speedKms ? `${Math.round(spaceWeatherScenario.cme.speedKms)} km/s` : "N/A"}
                  />
                </div>
                <div className="space-weather-notes">
                  {spaceWeatherScenario.riskNotes.slice(0, 2).map((note) => (
                    <span key={note}>{note}</span>
                  ))}
                </div>
                {spaceWeatherScenario.sourceUrl && (
                  <a href={spaceWeatherScenario.sourceUrl} target="_blank" rel="noreferrer" className="space-weather-link">
                    Open DONKI source
                  </a>
                )}
              </section>

              <section className="mission-card operational-playbook-card">
                <div className="mission-card-title mission-card-title-with-badge">
                  <Activity size={17} />
                  Operational Playbook
                  <span className={`route-status-badge ${stormActive ? "status-warn" : "status-ok"}`}>
                    {stormActive ? "Storm response" : "Ready"}
                  </span>
                </div>
                <div className="playbook-summary">
                  <strong>
                    {stormActive
                      ? `Protect Dawn-2; route ${selectedWorkload.name.toLowerCase()} through ${orbitalRouteAssignment?.recommendedNode.satellite.name ?? "Dawn-1"}.`
                      : `${orbitalRouteAssignment?.recommendedNode.satellite.name ?? "Primary node"} ready for ${selectedWorkload.name.toLowerCase()}.`}
                  </strong>
                  <span>
                    {orbitalRouteAssignment
                      ? `${orbitalRouteAssignment.selectedGroundStation.city} primary / ${orbitalRouteAssignment.backupGroundStation?.city ?? "backup ground"} backup`
                      : "Route assignment pending"}
                  </span>
                </div>
                <div className="playbook-list">
                  {operationalPlaybook.map((item) => (
                    <div key={`${item.action}-${item.target}`}>
                      <span>{item.action}</span>
                      <strong>{item.target}</strong>
                      <em className={`playbook-state is-${item.status}`}>{item.status}</em>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mission-card">
                <div className="mission-card-title">
                  <Activity size={17} />
                  Operations Status
                </div>
                <div className="ops-status-list">
                  <div>
                    <span>Dawn-1</span>
                    <strong className={stormActive ? "status-ok" : "status-cold"}>{stormActive ? "Taking Over" : "Primary Ready"}</strong>
                  </div>
                  <div>
                    <span>Dawn-2</span>
                    <strong className={stormActive ? "status-danger" : "status-ok"}>{stormActive ? "At Risk" : "Nominal"}</strong>
                  </div>
                  <div>
                    <span>Job queue</span>
                    <strong className={stormActive ? "status-warn" : "status-ok"}>{stormActive ? "Migrating" : "Stable"}</strong>
                  </div>
                  <div>
                    <span>Riyadh/Dubai SLA</span>
                    <strong className="status-ok">Maintained</strong>
                  </div>
                </div>
              </section>

              <section className="mission-card compact">
                <div className="mission-card-title">
                  <Orbit size={17} />
                  Operations Timeline
                </div>
                <div className="timeline-list">
                  <OperationEvent time="T+00" label="Nominal operations" active />
                  <OperationEvent time="T+06" label="Eclipse margin check" active={simulationOffsetHours >= 6} />
                  <OperationEvent time="T+12" label="CME/SEP risk detected" active={stormActive} warning={stormActive} />
                  <OperationEvent time="T+12:04" label="Workload migrated" active={stormActive} />
                  <OperationEvent time="T+12:15" label="Service stabilized" active={stormActive} />
                </div>
              </section>

              <section className="mission-card compact">
                <div className="mission-card-title">
                  <Cpu size={17} />
                  AI DC Routing
                </div>
                <div className="satellite-list">
                  <button
                    type="button"
                    className={`satellite-row ${selectedSatelliteId === "compute-a" ? "is-selected" : ""}`}
                    onClick={() => setSelectedSatelliteId("compute-a")}
                  >
                    <span>
                      <strong>Photonix Dawn-1</strong>
                      <small>
                        {stormActive
                          ? "absorbing priority job queue"
                          : orbitalRouteAssignment?.recommendedNode.satellite.id === "compute-a"
                            ? "recommended orbital DC path"
                            : "available orbital DC path"}
                      </small>
                    </span>
                    <em className={stormActive ? "status-ok" : routeStatusClass(routeRoleForSatellite(orbitalRouteAssignment, "compute-a") ?? "backup")}>
                      {stormActive ? "Taking Over" : routingRoleLabel(routeRoleForSatellite(orbitalRouteAssignment, "compute-a") ?? "backup")}
                    </em>
                  </button>
                  <button
                    type="button"
                    className={`satellite-row ${selectedSatelliteId === "compute-b" ? "is-selected" : ""}`}
                    onClick={() => setSelectedSatelliteId("compute-b")}
                  >
                    <span>
                      <strong>Photonix Dawn-2</strong>
                      <small>
                        {stormActive
                          ? "radiation exposure threshold exceeded"
                          : orbitalRouteAssignment?.backupNode?.satellite.id === "compute-b"
                            ? "backup orbital DC path"
                            : "parallel orbital DC path"}
                      </small>
                    </span>
                    <em className={stormActive ? "status-danger" : routeStatusClass(routeRoleForSatellite(orbitalRouteAssignment, "compute-b") ?? "recommended")}>
                      {stormActive ? "At Risk" : routingRoleLabel(routeRoleForSatellite(orbitalRouteAssignment, "compute-b") ?? "recommended")}
                    </em>
                  </button>
                </div>
              </section>
            </>
          )}
        </aside>
      </section>

      {plannerResponse && planWindowOpen && (
        <div className="plan-window-backdrop" role="presentation" onMouseDown={() => setPlanWindowOpen(false)}>
          <section
            className="plan-window"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mission-plan-window-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="plan-window-header">
              <div>
                <span>Generated mission plan</span>
                <h2 id="mission-plan-window-title">AI Mission Planner</h2>
              </div>
              <div className="plan-window-actions">
                <span className={`planner-source-badge is-${plannerSourceClass(plannerResponse)}`}>
                  {plannerSourceLabel(plannerResponse)}
                </span>
                <button type="button" onClick={() => setPlanWindowOpen(false)} aria-label="Close mission plan">
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="plan-window-body">
              <div className="plan-window-summary">
                <div>
                  <span>Summary</span>
                  <strong>{plannerResponse.summary}</strong>
                </div>
                <em>{plannerResponse.confidence} confidence</em>
              </div>

              <div className="planner-query-line">
                <span>Query</span>
                <p>{activePlannerQuestion}</p>
              </div>

              <div className="planner-config-strip plan-window-config" aria-label="Planner config used for generated plan">
                <PlannerChip label="Workload" value={activePlannerRequest.workload.name} />
                <PlannerChip label="Volume" value={`${activeSchedulerSnapshot.dataVolumeTb} TB`} />
                <PlannerChip label="Deadline" value={`${activeSchedulerSnapshot.deadlineMinutes} min`} />
                <PlannerChip label="Priority" value={priorityLabel(activeSchedulerSnapshot.priority)} />
                <PlannerChip label="Tolerance" value={passToleranceLabel(activeSchedulerSnapshot.passWindowTolerance)} />
                <PlannerChip label="LEO nodes" value={`${activeSchedulerSnapshot.leoNodeCount}`} />
              </div>

              <div className="plan-guardrail-strip">
                Model response uses Photonix deterministic mission inputs. Cost, water, latency, workload constraints, pass windows, and regulatory statements remain modeled demo assumptions.
              </div>

              <div className="mission-plan-sections plan-window-sections">
                {plannerResponse.sections.map((section) => {
                  const badge = sectionBadge(section);
                  return (
                    <article key={section.title} className="mission-plan-section">
                      <header>
                        <span>{section.title}</span>
                        {badge && <em>{badge}</em>}
                      </header>
                      <p>{section.body}</p>
                    </article>
                  );
                })}
              </div>

              {(plannerResponse.assumptions.length > 0 || plannerResponse.warnings.length > 0) && (
                <div className="planner-notes-grid plan-window-notes">
                  {plannerResponse.assumptions.length > 0 && (
                    <div>
                      <span>Assumptions</span>
                      {plannerResponse.assumptions.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  )}
                  {plannerResponse.warnings.length > 0 && (
                    <div>
                      <span>Warnings</span>
                      {plannerResponse.warnings.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function PlannerChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="planner-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Telemetry({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="telemetry-tile">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Timeline({ city, next, duration, active }: { city: string; next: string; duration: string; active: boolean }) {
  return (
    <div className={`timeline-row ${active ? "is-active" : ""}`}>
      <span>{city}</span>
      <strong>{active ? next : "Standby"}</strong>
      <small>{active ? `${duration} window` : "Run planner"}</small>
    </div>
  );
}

function OperationEvent({ time, label, active, warning = false }: { time: string; label: string; active: boolean; warning?: boolean }) {
  return (
    <div className={`timeline-row ${active ? "is-active" : ""} ${warning ? "is-warning" : ""}`}>
      <span>{label}</span>
      <strong>{active ? time : "Queued"}</strong>
      <small>{active ? "confirmed" : time}</small>
    </div>
  );
}
