import { FileText, X } from "lucide-react";
import type { AdvisorRecommendation, CoverageAnalysis, PlanningConstraints, Satellite } from "../types";
import { labelMission } from "../lib/advisor";

type ReportDrawerProps = {
  open: boolean;
  country: string;
  constraints: PlanningConstraints;
  satellites: Satellite[];
  analysis: CoverageAnalysis;
  advisor: AdvisorRecommendation;
  onClose: () => void;
};

export function ReportDrawer({
  open,
  country,
  constraints,
  satellites,
  analysis,
  advisor,
  onClose,
}: ReportDrawerProps) {
  return (
    <div
      className={`report-drawer fixed inset-x-0 bottom-0 z-[1200] p-5 shadow-2xl transition-transform duration-300 ${
        open ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="report-icon grid h-9 w-9 place-items-center text-signal">
              <FileText size={17} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-white">Deployment report</h3>
              <p className="text-sm text-slate-400">
                {country} - {labelMission(constraints.missionGoal)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="secondary-command grid h-9 w-9 place-items-center text-slate-300"
          >
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <ReportMetric label="Weighted coverage" value={`${analysis.weightedCoveragePercent}%`} />
          <ReportMetric label="Satellites used" value={`${satellites.filter((satellite) => satellite.enabled).length}/${constraints.maxSatellites}`} />
          <ReportMetric label="Budget used" value={`${analysis.totalCost}/${constraints.budget}`} />
          <ReportMetric label="Uncovered sites" value={`${analysis.uncoveredPoints.length}`} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <ReportText label="AI recommendation" value={advisor.summary} />
          <ReportText label="Next action" value={advisor.nextAction} />
          <ReportText label="Tradeoff" value={advisor.tradeoff} />
        </div>
      </div>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-section p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function ReportText({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-section p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-200">{value}</p>
    </div>
  );
}
