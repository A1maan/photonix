import {
  ArrowLeft,
  LocateFixed,
  Plus,
  RotateCcw,
  Satellite as SatelliteIcon,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import type {
  DemandCategory,
  MissionGoal,
  PlanningConstraints,
  Priority,
  Satellite,
  SatelliteType,
} from "../types";
import { labelMission } from "../lib/advisor";

type PlanningSidebarProps = {
  constraints: PlanningConstraints;
  satelliteTypes: SatelliteType[];
  satellites: Satellite[];
  newPointCategory: DemandCategory;
  newPointPriority: Priority;
  onConstraintsChange: (constraints: PlanningConstraints) => void;
  onNewPointCategoryChange: (category: DemandCategory) => void;
  onNewPointPriorityChange: (priority: Priority) => void;
  onAddSatellite: () => void;
  onRemoveSatellite: (id: string) => void;
  onSatelliteTypeChange: (id: string, typeId: string) => void;
  onOptimize: () => void;
  onReset: () => void;
  onPreset: (preset: "low_budget" | "disaster" | "schools") => void;
  onBackToGlobe: () => void;
};

const missionGoals: MissionGoal[] = [
  "rural_broadband",
  "disaster_response",
  "schools_clinics",
  "minimum_cost",
  "emergency_backup",
];

const demandCategories: DemandCategory[] = ["rural", "clinic", "school", "emergency", "logistics", "custom"];
const priorities: Priority[] = ["low", "medium", "high", "critical"];

export function PlanningSidebar({
  constraints,
  satelliteTypes,
  satellites,
  newPointCategory,
  newPointPriority,
  onConstraintsChange,
  onNewPointCategoryChange,
  onNewPointPriorityChange,
  onAddSatellite,
  onRemoveSatellite,
  onSatelliteTypeChange,
  onOptimize,
  onReset,
  onPreset,
  onBackToGlobe,
}: PlanningSidebarProps) {
  const enabledCount = satellites.filter((satellite) => satellite.enabled).length;

  return (
    <aside className="planner-sidebar flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
      <div className="planner-brand">
        <button
          type="button"
          onClick={onBackToGlobe}
          className="planner-back-button mb-7 flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={17} /> Back to globe
        </button>
        <img
          src="/assets/photonix-logo-no-bg-trimmed.png"
          alt="Photonix"
          className="w-40 object-contain object-left"
        />
        <p className="eyebrow mt-5 text-signal">Mission control</p>
        <h2 className="planner-title mt-2">Saudi network planner</h2>
      </div>

      <section className="panel-section p-4">
        <div className="section-title mb-3">
          <SlidersHorizontal size={16} className="text-signal" />
          Mission constraints
        </div>
        <label className="block text-xs text-slate-400">Mission goal</label>
        <select
          value={constraints.missionGoal}
          onChange={(event) =>
            onConstraintsChange({ ...constraints, missionGoal: event.target.value as MissionGoal })
          }
          className="field-control mt-2 px-3 py-2 text-sm"
        >
          {missionGoals.map((goal) => (
            <option key={goal} value={goal}>
              {labelMission(goal)}
            </option>
          ))}
        </select>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-400">
            Budget
            <input
              type="number"
              value={constraints.budget}
              min={20}
              max={240}
              onChange={(event) =>
                onConstraintsChange({ ...constraints, budget: Number(event.target.value) })
              }
              className="field-control mt-2 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-400">
            Max sats
            <input
              type="number"
              value={constraints.maxSatellites}
              min={1}
              max={6}
              onChange={(event) =>
                onConstraintsChange({ ...constraints, maxSatellites: Number(event.target.value) })
              }
              className="field-control mt-2 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-400">Allowed satellite types</p>
          {satelliteTypes.map((type) => (
            <label key={type.id} className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: type.color }} />
                {type.name}
              </span>
              <input
                type="checkbox"
                checked={constraints.allowedSatelliteTypes.includes(type.id)}
                onChange={(event) => {
                  const allowedSatelliteTypes = event.target.checked
                    ? [...constraints.allowedSatelliteTypes, type.id]
                    : constraints.allowedSatelliteTypes.filter((id) => id !== type.id);
                  onConstraintsChange({ ...constraints, allowedSatelliteTypes });
                }}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="panel-section p-4">
        <div className="section-title mb-3">
          <SatelliteIcon size={16} className="text-signal" />
          Satellites
        </div>
        <div className="space-y-3">
          {satellites
            .filter((satellite) => satellite.enabled)
            .map((satellite) => (
              <div key={satellite.id} className="tool-row p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-white">{satellite.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveSatellite(satellite.id)}
                    className="text-xs text-slate-400 transition hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
                <select
                  value={satellite.typeId}
                  onChange={(event) => onSatelliteTypeChange(satellite.id, event.target.value)}
                  className="field-control px-2 py-2 text-xs"
                >
                  {satelliteTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} - {type.cost} cost
                    </option>
                  ))}
                </select>
              </div>
            ))}
        </div>
        <button
          type="button"
          onClick={onAddSatellite}
          disabled={enabledCount >= constraints.maxSatellites}
          className="secondary-command mt-3 flex w-full items-center justify-center gap-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Plus size={16} /> Add satellite
        </button>
      </section>

      <section className="panel-section p-4">
        <div className="section-title mb-3">
          <LocateFixed size={16} className="text-signal" />
          New demand point
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select
            value={newPointCategory}
            onChange={(event) => onNewPointCategoryChange(event.target.value as DemandCategory)}
            className="field-control px-2 py-2 text-xs"
          >
            {demandCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={newPointPriority}
            onChange={(event) => onNewPointPriorityChange(event.target.value as Priority)}
            className="field-control px-2 py-2 text-xs"
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="panel-section-plain">
        <p className="mb-3 text-sm font-semibold text-white">Demo presets</p>
        <div className="grid gap-2">
          <button type="button" onClick={() => onPreset("low_budget")} className="preset-command px-3 py-2 text-left text-xs">
            Low Budget Rural Broadband
          </button>
          <button type="button" onClick={() => onPreset("disaster")} className="preset-command px-3 py-2 text-left text-xs">
            Disaster Response
          </button>
          <button type="button" onClick={() => onPreset("schools")} className="preset-command px-3 py-2 text-left text-xs">
            Schools And Clinics Priority
          </button>
        </div>
      </section>

      <div className="planner-actions sticky bottom-0 mt-auto grid gap-2 pt-3">
        <button
          type="button"
          onClick={onOptimize}
          className="primary-command flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold"
        >
          <Zap size={16} /> Optimize under constraints
        </button>
        <button
          type="button"
          onClick={onReset}
          className="secondary-command flex items-center justify-center gap-2 px-4 py-2 text-sm hover:border-danger/70"
        >
          <RotateCcw size={16} /> Reset demo
        </button>
      </div>
    </aside>
  );
}
