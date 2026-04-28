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
  Orbit,
  Pause,
  Play,
  RadioTower,
  Satellite,
  Send,
  Sparkles,
  Sun,
  SlidersHorizontal,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cachedStarlinkTles, computeSatellites, groundStations, orbitalWorkloads } from "../data/orbitalDemo";
import {
  buildDownlinkArcs,
  buildSunSyncPath,
  compareOrbitalToTerrestrial,
  createTrackedSatellites,
  groundStationPoints,
  projectComputeSatellite,
  propagateTrackedSatellites,
  type DownlinkArc,
  type OrbitPoint,
} from "../lib/orbit";
import type { ComputeSatellite, OrbitalWorkload } from "../types";

type MissionControlProps = {
  country: string;
  logoTransitioning?: boolean;
  onBackToGlobe: () => void;
};

type ChatMessage = {
  role: "operator" | "planner";
  text: string;
};

type MissionMode = "plan" | "simulate";
type PlanPriority = "solar" | "latency" | "cost";
type AltitudePreset = 550 | 610 | 720;

type PlannerSection = {
  title: string;
  body: string;
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
  "Where should I place an orbital AI data center to run LLM inference for users in Saudi Arabia with maximum solar uptime?";
const ALTITUDE_PRESETS: AltitudePreset[] = [550, 610, 720];
const PRIORITIES: Array<{ id: PlanPriority; label: string }> = [
  { id: "solar", label: "Solar uptime" },
  { id: "latency", label: "Latency" },
  { id: "cost", label: "Cost" },
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

function satelliteStatus(satellite: ComputeSatellite, workload: OrbitalWorkload) {
  if (satellite.powerKw >= workload.requiredPowerKw && satellite.thermalCapacityKw >= workload.requiredPowerKw) {
    return { label: "Nominal", className: "status-ok" };
  }
  if (satellite.powerKw + 8 >= workload.requiredPowerKw) {
    return { label: "Cluster", className: "status-warn" };
  }
  return { label: "Reserve", className: "status-cold" };
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

function buildPlannerSections(
  workload: OrbitalWorkload,
  metrics: PlanMetrics,
  altitudeKm: AltitudePreset,
  priority: PlanPriority,
  comparison: ReturnType<typeof compareOrbitalToTerrestrial>,
): PlannerSection[] {
  const priorityLabel = PRIORITIES.find((item) => item.id === priority)?.label ?? "Solar uptime";

  return [
    {
      title: "Recommended Orbit",
      body: `${altitudeKm} km dawn-dusk shell tuned for ${priorityLabel.toLowerCase()}, ${metrics.totalSatellites} compute sats across the configured planes.`,
    },
    {
      title: "Data Center Assignment",
      body: `${workload.name} runs on Dawn-1 and Dawn-2 first, with Gulf Nano held as regional reserve for burst or degraded operations.`,
    },
    {
      title: "Downlink Plan",
      body: `Primary paths stay Riyadh and Dubai, with Abu Dhabi as overflow. Modeled GCC coverage score is ${metrics.coverageScore}%.`,
    },
    {
      title: "Cost/Water Impact",
      body: `${formatCurrency(metrics.launchCost)} launch envelope, ${formatCurrency(comparison.orbitalMonthlyCost)} modeled orbital monthly, and ${formatNumber(comparison.terrestrialWaterLitersDay)} L/day avoided versus ground cooling.`,
    },
    {
      title: "Risk Notes",
      body: `This is a deterministic demo model. Exact pass timing, radiation exposure, and live capacity pricing need production-grade analysis later.`,
    },
  ];
}

export function MissionControl({ country, logoTransitioning = false, onBackToGlobe }: MissionControlProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const answerTimerRef = useRef<number | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [activeMode, setActiveMode] = useState<MissionMode>("plan");
  const [selectedWorkloadId, setSelectedWorkloadId] = useState<OrbitalWorkload["id"]>("llm");
  const [orbitalPlanes, setOrbitalPlanes] = useState(2);
  const [satellitesPerPlane, setSatellitesPerPlane] = useState(3);
  const [altitudeKm, setAltitudeKm] = useState<AltitudePreset>(550);
  const [planPriority, setPlanPriority] = useState<PlanPriority>("solar");
  const [simulationOffsetHours, setSimulationOffsetHours] = useState(0);
  const [simulationPlaying, setSimulationPlaying] = useState(false);
  const [stormActive, setStormActive] = useState(false);
  const [missionActive, setMissionActive] = useState(false);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [thinking, setThinking] = useState(false);
  const [selectedSatelliteId, setSelectedSatelliteId] = useState("compute-a");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "planner",
      text: "Photonix planner is standing by with cached Starlink shell data, GCC ground stations, and orbital compute presets.",
    },
  ]);
  const { width, height } = useWindowSize();

  const selectedWorkload = useMemo(
    () => orbitalWorkloads.find((workload) => workload.id === selectedWorkloadId) ?? orbitalWorkloads[0],
    [selectedWorkloadId],
  );
  const simulationDate = useMemo(
    () => new Date(DEMO_ORBIT_START + simulationOffsetHours * 60 * 60 * 1000),
    [simulationOffsetHours],
  );
  const starlinkPropagationDate = activeMode === "simulate" ? simulationDate : clock;
  const computePropagationDate = useMemo(
    () => (activeMode === "simulate" ? simulationDate : new Date(DEMO_ORBIT_START)),
    [activeMode, simulationDate],
  );
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
  const plannerSections = useMemo(
    () => buildPlannerSections(selectedWorkload, planMetrics, altitudeKm, planPriority, comparison),
    [altitudeKm, comparison, planMetrics, planPriority, selectedWorkload],
  );
  const selectedSatellite = computeSatellites.find((satellite) => satellite.id === selectedSatelliteId) ?? computeSatellites[0];
  const activeCompute = missionActive || activeMode === "simulate"
    ? computeSatellites.slice(0, selectedWorkload.id === "training" ? 3 : 2)
    : [];

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
      if (answerTimerRef.current) {
        window.clearTimeout(answerTimerRef.current);
      }
    };
  }, []);

  const runPlanner = (overrideQuestion?: string) => {
    const trimmedQuestion = overrideQuestion?.trim() || question.trim() || DEFAULT_QUESTION;
    if (answerTimerRef.current) {
      window.clearTimeout(answerTimerRef.current);
    }

    setMissionActive(true);
    setThinking(true);
    setSidebarOpen(true);
    setSelectedSatelliteId("compute-a");
    setMessages([{ role: "operator", text: trimmedQuestion }]);
    globeRef.current?.pointOfView({ lat: 24.8, lng: 50.2, altitude: 1.38 }, 1100);

    answerTimerRef.current = window.setTimeout(() => {
      setThinking(false);
    }, 850);
  };

  const runGccLlmScenario = () => {
    setActiveMode("plan");
    setSelectedWorkloadId("llm");
    setOrbitalPlanes(2);
    setSatellitesPerPlane(3);
    setAltitudeKm(550);
    setPlanPriority("solar");
    setQuestion(DEFAULT_QUESTION);
    runPlanner(DEFAULT_QUESTION);
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
      className={`mission-control min-h-screen bg-[#02060b] text-white ${sidebarOpen ? "is-drawer-open" : ""} ${
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
            globeOffset={width >= 1120 ? (sidebarOpen ? [-260, 0] : [230, 0]) : [0, 0]}
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
            arcsData={downlinkArcs}
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
              return `${item.name}<br/>Orbital AI data center<br/>${item.satellite?.gpuType ?? "GPU"} compute node`;
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
                <div className="storm-front">
                  <span>Solar storm front</span>
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="mission-demo-cta absolute z-20"
            onClick={runGccLlmScenario}
          >
            <Sparkles size={15} />
            Run GCC LLM scenario
          </button>
          <div className="mission-telemetry absolute bottom-5 left-5 right-5 z-20 grid gap-3 sm:grid-cols-3">
            <Telemetry
              icon={<Satellite size={16} />}
              label={activeMode === "simulate" ? "Simulation time" : "Plan constellation"}
              value={activeMode === "simulate" ? `+${simulationOffsetHours}h` : `${planMetrics.totalSatellites} sats`}
            />
            <Telemetry
              icon={<RadioTower size={16} />}
              label={activeMode === "simulate" ? "Ops state" : "Launch manifest"}
              value={activeMode === "simulate" ? (stormActive ? "Storm active" : "Nominal") : `${planMetrics.launches} launches`}
            />
            <Telemetry
              icon={<Sun size={16} />}
              label={activeMode === "simulate" ? "Workload routing" : "Modeled uptime"}
              value={activeMode === "simulate" ? (stormActive ? "Migrated" : "Primary") : `${planMetrics.solarUptime}% solar`}
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

        <aside className={`mission-panel ${sidebarOpen ? "is-open" : ""}`}>
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
                        setQuestion(
                          workload.id === "llm"
                            ? DEFAULT_QUESTION
                            : `Plan orbital AI data center capacity for ${workload.name.toLowerCase()} serving the GCC.`,
                        );
                      }}
                      className={`workload-option ${workload.id === selectedWorkloadId ? "is-selected" : ""}`}
                    >
                      <span>{workload.name}</span>
                      <small>{workload.requiredPowerKw} kW target</small>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{selectedWorkload.description}</p>
              </section>

              <section className="mission-card">
                <div className="mission-card-title">
                  <SlidersHorizontal size={17} />
                  Constellation Builder
                </div>
                <div className="builder-grid">
                  <label>
                    <span>Orbital planes</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={orbitalPlanes}
                      onChange={(event) => setOrbitalPlanes(Math.min(8, Math.max(1, Number(event.target.value) || 1)))}
                    />
                  </label>
                  <label>
                    <span>Sats per plane</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={satellitesPerPlane}
                      onChange={(event) => setSatellitesPerPlane(Math.min(12, Math.max(1, Number(event.target.value) || 1)))}
                    />
                  </label>
                </div>
                <div className="control-block">
                  <span>Altitude preset</span>
                  <div className="segmented-grid">
                    {ALTITUDE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={altitudeKm === preset ? "is-selected" : ""}
                        onClick={() => setAltitudeKm(preset)}
                      >
                        {preset} km
                      </button>
                    ))}
                  </div>
                </div>
                <div className="control-block">
                  <span>Optimization priority</span>
                  <div className="segmented-grid">
                    {PRIORITIES.map((priority) => (
                      <button
                        key={priority.id}
                        type="button"
                        className={planPriority === priority.id ? "is-selected" : ""}
                        onClick={() => setPlanPriority(priority.id)}
                      >
                        {priority.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="comparison-grid">
                  <Metric label="Total sats" value={`${planMetrics.totalSatellites}`} />
                  <Metric label="Launches" value={`${planMetrics.launches}`} />
                  <Metric label="Launch cost" value={formatCurrency(planMetrics.launchCost)} />
                  <Metric label="Solar uptime" value={`${planMetrics.solarUptime}%`} />
                  <Metric label="GCC coverage" value={`${planMetrics.coverageScore}%`} />
                </div>
              </section>

              <section className="mission-card chat-card">
                <div className="mission-card-title">
                  <Bot size={17} />
                  AI Mission Planner
                </div>
                <div className="chat-log">
                  {messages.slice(-2).map((message, index) => (
                    <div key={`${message.role}-${index}-${message.text.slice(0, 12)}`} className={`chat-message ${message.role}`}>
                      {message.text}
                    </div>
                  ))}
                  {thinking && <div className="chat-message planner is-thinking">Analyzing orbit slots, sunlight and GCC downlinks...</div>}
                  {missionActive && !thinking && (
                    <div className="planner-result-grid">
                      {plannerSections.map((section) => (
                        <div key={section.title} className="planner-result-card">
                          <span>{section.title}</span>
                          <p>{section.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <form
                  className="chat-form"
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
                  <button type="submit" className="mission-send" aria-label="Ask mission planner">
                    <Send size={16} />
                    Run demo query
                  </button>
                </form>
              </section>

              <section className="mission-card">
                <div className="mission-card-title">
                  <Cpu size={17} />
                  Orbital AI Data Centers
                </div>
                <div className="satellite-list">
                  {computeSatellites.map((satellite) => {
                    const status = satelliteStatus(satellite, selectedWorkload);
                    const selected = satellite.id === selectedSatellite.id;
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
                        </span>
                        <em className={status.className}>{status.label}</em>
                      </button>
                    );
                  })}
                </div>
                <div className="spec-grid">
                  <Spec label="Power" value={`${selectedSatellite.powerKw} kW`} />
                  <Spec label="Thermal" value={`${selectedSatellite.thermalCapacityKw} kW`} />
                  <Spec label="Sunlight" value={`${selectedSatellite.sunlightPercent}%`} />
                  <Spec label="Inclination" value={`${selectedSatellite.inclinationDeg} deg`} />
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
                  <Timeline city="Riyadh" next="14 min" duration="8 min" active={missionActive} />
                  <Timeline city="Dubai" next="18 min" duration="7 min" active={missionActive} />
                  <Timeline city="Abu Dhabi" next="21 min" duration="6 min" active={missionActive} />
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
                  {stormActive ? "Reset Storm" : "Trigger Solar Storm"}
                </button>
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
                    <span>LLM workload</span>
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
                  <OperationEvent time="T+12" label="Solar storm detected" active={stormActive} warning={stormActive} />
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
                  <button type="button" className="satellite-row is-selected" onClick={() => setSelectedSatelliteId("compute-a")}>
                    <span>
                      <strong>Photonix Dawn-1</strong>
                      <small>{stormActive ? "absorbing LLM inference queue" : "primary orbital DC path"}</small>
                    </span>
                    <em className={stormActive ? "status-ok" : "status-warn"}>{stormActive ? "Taking Over" : "Primary"}</em>
                  </button>
                  <button type="button" className="satellite-row" onClick={() => setSelectedSatelliteId("compute-b")}>
                    <span>
                      <strong>Photonix Dawn-2</strong>
                      <small>{stormActive ? "radiation exposure threshold exceeded" : "parallel orbital DC path"}</small>
                    </span>
                    <em className={stormActive ? "status-danger" : "status-ok"}>{stormActive ? "At Risk" : "Nominal"}</em>
                  </button>
                </div>
              </section>
            </>
          )}

          <section className="mission-card compact">
            <div className="mission-card-title">
              <Sparkles size={17} />
              Demo Assumptions
            </div>
            <div className="assumption-list">
              <span>Cached CelesTrak Starlink TLE snapshot, 168 satellites</span>
              <span>Scripted planner and deterministic storm model, no live Claude claim</span>
              <span>Modeled GCC downlink windows for presentation</span>
            </div>
          </section>
        </aside>
      </section>
    </main>
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
