import Globe, { type GlobeMethods } from "react-globe.gl";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Cpu,
  DatabaseZap,
  Orbit,
  RadioTower,
  Satellite,
  Send,
  Sparkles,
  Sun,
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
  missionPlannerResponse,
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

const SAUDI_VIEW = { lat: 24.4, lng: 49.2, altitude: 1.34 };
const GLOBE_IMAGE_URL = "/assets/earth-day.jpg";
const BACKGROUND_IMAGE_URL = "/assets/night-sky.png";
const DEFAULT_QUESTION =
  "Where should I place an orbital AI data center to run LLM inference for users in Saudi Arabia with maximum solar uptime?";

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

export function MissionControl({ country, logoTransitioning = false, onBackToGlobe }: MissionControlProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const answerTimerRef = useRef<number | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [selectedWorkloadId, setSelectedWorkloadId] = useState<OrbitalWorkload["id"]>("llm");
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
  const trackedSatellites = useMemo(() => createTrackedSatellites(cachedStarlinkTles), []);
  const starlinkPoints = useMemo(
    () => propagateTrackedSatellites(trackedSatellites, clock),
    [clock, trackedSatellites],
  );
  const computePoints = useMemo(
    () => computeSatellites.map((satellite) => projectComputeSatellite(satellite, clock)),
    [clock],
  );
  const groundPoints = useMemo(() => groundStationPoints(groundStations), []);
  const allPoints = useMemo(
    () => [...starlinkPoints, ...computePoints, ...groundPoints],
    [computePoints, groundPoints, starlinkPoints],
  );
  const downlinkArcs = useMemo(
    () => buildDownlinkArcs(computePoints, groundStations, missionActive),
    [computePoints, missionActive],
  );
  const sunSyncPath = useMemo(() => [{ id: "sun-sync-slot", points: buildSunSyncPath() }], []);
  const comparison = useMemo(
    () => compareOrbitalToTerrestrial(computeSatellites, selectedWorkload),
    [selectedWorkload],
  );
  const selectedSatellite = computeSatellites.find((satellite) => satellite.id === selectedSatelliteId) ?? computeSatellites[0];
  const activeCompute = missionActive ? computeSatellites.slice(0, selectedWorkload.id === "training" ? 3 : 2) : [];

  const globeWidth = width;
  const globeHeight = height;

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(interval);
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
      if (answerTimerRef.current) {
        window.clearTimeout(answerTimerRef.current);
      }
    };
  }, []);

  const runPlanner = (overrideQuestion?: string, overrideWorkload?: OrbitalWorkload) => {
    const activeWorkload = overrideWorkload ?? selectedWorkload;
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
      setMessages((current) => [
        ...current,
        {
          role: "planner",
          text: missionPlannerResponse(activeWorkload, computeSatellites),
        },
      ]);
      setThinking(false);
    }, 850);
  };

  const runGccLlmScenario = () => {
    const llmWorkload = orbitalWorkloads.find((workload) => workload.id === "llm") ?? orbitalWorkloads[0];
    setSelectedWorkloadId("llm");
    setQuestion(DEFAULT_QUESTION);
    runPlanner(DEFAULT_QUESTION, llmWorkload);
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
            pathsData={missionActive ? sunSyncPath : []}
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
          />

          <div className="mission-stage-shade pointer-events-none absolute inset-0" />
          <button
            type="button"
            className="mission-demo-cta absolute z-20"
            onClick={runGccLlmScenario}
          >
            <Sparkles size={15} />
            Run GCC LLM scenario
          </button>
          <div className="mission-telemetry absolute bottom-5 left-5 right-5 z-20 grid gap-3 sm:grid-cols-3">
            <Telemetry icon={<Satellite size={16} />} label="Tracked shell" value={`${cachedStarlinkTles.length} sats`} />
            <Telemetry icon={<RadioTower size={16} />} label="GCC stations" value={`${groundStations.length} sites`} />
            <Telemetry icon={<Sun size={16} />} label="Recommended uptime" value={`${Math.round(comparison.orbitalUptime)}% solar`} />
          </div>
        </div>

        <button
          type="button"
          className={`mission-drawer-toggle ${sidebarOpen ? "is-open" : ""}`}
          onClick={() => setSidebarOpen((current) => !current)}
          aria-label={sidebarOpen ? "Close mission controls" : "Open mission controls"}
        >
          {sidebarOpen ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
          <span>{sidebarOpen ? "Hide" : "Plan"}</span>
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

          <section className="mission-card chat-card">
            <div className="mission-card-title">
              <Bot size={17} />
              AI Mission Planner
            </div>
            <div className="chat-log">
              {messages.slice(-4).map((message, index) => (
                <div key={`${message.role}-${index}-${message.text.slice(0, 12)}`} className={`chat-message ${message.role}`}>
                  {message.text}
                </div>
              ))}
              {thinking && <div className="chat-message planner is-thinking">Analyzing orbit slots, sunlight and GCC downlinks...</div>}
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
              Compute Satellites
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

          <section className="mission-card compact">
            <div className="mission-card-title">
              <Sparkles size={17} />
              Demo Assumptions
            </div>
            <div className="assumption-list">
              <span>Cached CelesTrak Starlink TLE snapshot, 168 satellites</span>
              <span>Scripted planner response, no live Claude claim</span>
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
