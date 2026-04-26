import { AlertTriangle, Banknote, RadioTower, Target } from "lucide-react";
import type { CoverageAnalysis } from "../types";

type CoverageInspectorProps = {
  analysis: CoverageAnalysis;
  satelliteCount: number;
  maxSatellites: number;
};

export function CoverageInspector({ analysis, satelliteCount, maxSatellites }: CoverageInspectorProps) {
  return (
    <section className="panel-section p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Plan status</h3>
        <span className="status-chip px-2 py-1 text-xs">
          {satelliteCount}/{maxSatellites} sats
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={<Target size={16} />} label="Weighted coverage" value={`${analysis.weightedCoveragePercent}%`} />
        <Kpi icon={<RadioTower size={16} />} label="Demand covered" value={`${analysis.coveragePercent}%`} />
        <Kpi icon={<Banknote size={16} />} label="Cost used" value={`${analysis.totalCost}`} />
        <Kpi icon={<Banknote size={16} />} label="Budget left" value={`${analysis.budgetRemaining}`} danger={analysis.budgetRemaining < 0} />
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>Coverage progress</span>
          <span>{analysis.weightedCoveragePercent}%</span>
        </div>
        <div className="coverage-track h-2 overflow-hidden bg-black/60">
          <div
            className="h-full bg-signal transition-all"
            style={{ width: `${analysis.weightedCoveragePercent}%` }}
          />
        </div>
      </div>

      {analysis.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {analysis.warnings.map((warning) => (
            <div key={warning} className="flex gap-2 rounded-md border border-danger/25 bg-danger/10 p-2 text-xs text-red-100">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
              {warning}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="kpi-tile p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
        <span className={danger ? "text-danger" : "text-signal"}>{icon}</span>
        {label}
      </div>
      <p className={danger ? "text-2xl font-semibold text-danger" : "text-2xl font-semibold text-white"}>
        {value}
      </p>
    </div>
  );
}
