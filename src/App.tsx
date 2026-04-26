import { BarChart3, Check, FileText, Globe2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AIAdvisorPanel } from "./components/AIAdvisorPanel";
import { CoverageInspector } from "./components/CoverageInspector";
import { GlobeSelector } from "./components/GlobeSelector";
import { MapPlanner } from "./components/MapPlanner";
import { PlanningSidebar } from "./components/PlanningSidebar";
import { ReportDrawer } from "./components/ReportDrawer";
import { defaultConstraints, initialSatellites, satelliteTypes, seedDemandPoints } from "./data/demo";
import { explainCurrentPlan, explainOptimization, getFallbackStrategy, labelMission } from "./lib/advisor";
import { analyzeCoverage } from "./lib/coverage";
import { optimizeSatellites } from "./lib/optimizer";
import type {
  AdvisorRecommendation,
  DemandCategory,
  DemandPoint,
  OptimizationResult,
  PlanningConstraints,
  Priority,
  Satellite,
} from "./types";

export function App() {
  const [country, setCountry] = useState<string | null>(null);
  const [demandPoints, setDemandPoints] = useState<DemandPoint[]>(seedDemandPoints);
  const [satellites, setSatellites] = useState<Satellite[]>(initialSatellites);
  const [constraints, setConstraints] = useState<PlanningConstraints>(defaultConstraints);
  const [newPointCategory, setNewPointCategory] = useState<DemandCategory>("emergency");
  const [newPointPriority, setNewPointPriority] = useState<Priority>("high");
  const [lastOptimization, setLastOptimization] = useState<OptimizationResult | null>(null);
  const [advisor, setAdvisor] = useState<AdvisorRecommendation | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [startOnGlobe, setStartOnGlobe] = useState(false);

  const strategy = useMemo(() => getFallbackStrategy(constraints), [constraints]);
  const analysis = useMemo(
    () => analyzeCoverage(satellites, demandPoints, satelliteTypes, constraints),
    [satellites, demandPoints, constraints],
  );
  const currentAdvisor = advisor ?? explainCurrentPlan(analysis, constraints, strategy);
  const coveredIds = useMemo(
    () => new Set(analysis.coveredPoints.map((point) => point.id)),
    [analysis.coveredPoints],
  );

  if (!country) {
    return (
      <GlobeSelector
        startOnGlobe={startOnGlobe}
        onSelectCountry={(nextCountry) => {
          setCountry(nextCountry);
          setStartOnGlobe(false);
        }}
      />
    );
  }

  const addDemandPoint = (lat: number, lng: number) => {
    const next: DemandPoint = {
      id: `custom-${Date.now()}`,
      name: `Custom ${newPointCategory} point ${demandPoints.filter((point) => point.userCreated).length + 1}`,
      lat,
      lng,
      priority: newPointPriority,
      populationWeight: newPointPriority === "critical" ? 70 : newPointPriority === "high" ? 55 : 35,
      category: newPointCategory,
      userCreated: true,
    };
    setDemandPoints((current) => [...current, next]);
    setAdvisor(null);
  };

  const moveSatellite = (id: string, lat: number, lng: number) => {
    setSatellites((current) =>
      current.map((satellite) =>
        satellite.id === id ? { ...satellite, lat, lng, suggested: false } : satellite,
      ),
    );
    setAdvisor(null);
  };

  const addSatellite = () => {
    const enabled = satellites.filter((satellite) => satellite.enabled);
    if (enabled.length >= constraints.maxSatellites) {
      return;
    }
    setSatellites((current) => [
      ...current,
      {
        id: `sat-${Date.now()}`,
        name: `Relay ${String.fromCharCode(65 + enabled.length)}`,
        typeId: constraints.allowedSatelliteTypes[0] ?? satelliteTypes[0].id,
        lat: 23.8 + enabled.length * 0.7,
        lng: 44.5 + enabled.length * 0.8,
        enabled: true,
      },
    ]);
    setAdvisor(null);
  };

  const optimize = () => {
    const result = optimizeSatellites(satellites, demandPoints, satelliteTypes, constraints, strategy);
    setLastOptimization(result);
    setSatellites(result.suggestedSatellites);
    setAdvisor(explainOptimization(result));
  };

  const reset = () => {
    setDemandPoints(seedDemandPoints);
    setSatellites(initialSatellites);
    setConstraints(defaultConstraints);
    setAdvisor(null);
    setLastOptimization(null);
    setReportOpen(false);
  };

  const applyPreset = (preset: "low_budget" | "disaster" | "schools") => {
    const next: PlanningConstraints =
      preset === "low_budget"
        ? {
            ...defaultConstraints,
            missionGoal: "rural_broadband",
            budget: 82,
            maxSatellites: 2,
            allowedSatelliteTypes: ["leo-economy", "meo-balanced"],
          }
        : preset === "disaster"
          ? {
              ...defaultConstraints,
              missionGoal: "disaster_response",
              budget: 116,
              maxSatellites: 3,
            }
          : {
              ...defaultConstraints,
              missionGoal: "schools_clinics",
              budget: 128,
              maxSatellites: 3,
            };
    setConstraints(next);
    setSatellites(initialSatellites);
    setAdvisor(null);
  };

  return (
    <main className="app-shell min-h-screen text-white">
      <div className="planner-grid grid min-h-screen lg:grid-cols-[360px_minmax(0,1fr)_376px]">
        <PlanningSidebar
          constraints={constraints}
          satelliteTypes={satelliteTypes}
          satellites={satellites}
          newPointCategory={newPointCategory}
          newPointPriority={newPointPriority}
          onConstraintsChange={(next) => {
            setConstraints(next);
            setAdvisor(null);
          }}
          onNewPointCategoryChange={setNewPointCategory}
          onNewPointPriorityChange={setNewPointPriority}
          onAddSatellite={addSatellite}
          onRemoveSatellite={(id) => {
            setSatellites((current) => current.filter((satellite) => satellite.id !== id));
            setAdvisor(null);
          }}
          onSatelliteTypeChange={(id, typeId) => {
            setSatellites((current) =>
              current.map((satellite) => (satellite.id === id ? { ...satellite, typeId } : satellite)),
            );
            setAdvisor(null);
          }}
          onOptimize={optimize}
          onReset={reset}
          onPreset={applyPreset}
          onBackToGlobe={() => {
            setStartOnGlobe(true);
            setCountry(null);
          }}
        />

        <section className="workspace-panel min-w-0 px-5 py-5">
          <header className="workspace-header mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow flex items-center gap-2">
                <Globe2 size={14} className="text-signal" />
                {country}
              </div>
              <h1 className="workspace-title mt-1">
                {labelMission(constraints.missionGoal)} coverage plan
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="tool-command flex items-center gap-2 px-3 py-2 text-sm"
              >
                <FileText size={15} /> Report
              </button>
            </div>
          </header>

          <MapPlanner
            demandPoints={demandPoints}
            satellites={satellites}
            satelliteTypes={satelliteTypes}
            coveredIds={coveredIds}
            missionGoal={constraints.missionGoal}
            newPointCategory={newPointCategory}
            newPointPriority={newPointPriority}
            onAddDemandPoint={addDemandPoint}
            onMoveSatellite={moveSatellite}
          />
        </section>

        <aside className="planner-sidebar inspector-rail flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-5 py-5">
          <CoverageInspector
            analysis={analysis}
            satelliteCount={satellites.filter((satellite) => satellite.enabled).length}
            maxSatellites={constraints.maxSatellites}
          />
          <AIAdvisorPanel strategy={strategy} recommendation={currentAdvisor} />

          <section className="panel-section p-4">
            <div className="section-title mb-3">
              <BarChart3 size={16} className="text-signal" />
              Coverage gaps
            </div>
            <div className="space-y-2">
              {analysis.uncoveredPoints.slice(0, 5).map((point) => (
                <div key={point.id} className="tool-row flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-sm text-white">{point.name}</p>
                    <p className="text-xs text-slate-500">
                      {point.category} - {point.priority}
                    </p>
                  </div>
                  <span className="rounded-full border border-danger/30 px-2 py-1 text-xs text-danger">
                    Open
                  </span>
                </div>
              ))}
              {analysis.uncoveredPoints.length === 0 && (
                <div className="flex items-center gap-2 rounded-md border border-signal/30 bg-signal/10 p-3 text-sm text-signal">
                  <Check size={15} /> All tracked demand points are covered.
                </div>
              )}
            </div>
          </section>

          {lastOptimization && (
            <section className="panel-section p-4">
              <p className="text-sm font-semibold text-white">Last optimization</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {lastOptimization.before.weightedCoveragePercent}% to{" "}
                {lastOptimization.after.weightedCoveragePercent}% weighted coverage.{" "}
                {lastOptimization.explanation}
              </p>
            </section>
          )}
        </aside>
      </div>

      <ReportDrawer
        open={reportOpen}
        country={country}
        constraints={constraints}
        satellites={satellites}
        analysis={analysis}
        advisor={currentAdvisor}
        onClose={() => setReportOpen(false)}
      />
    </main>
  );
}
