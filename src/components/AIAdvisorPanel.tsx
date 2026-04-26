import { BrainCircuit } from "lucide-react";
import type { AdvisorRecommendation, OptimizationStrategy } from "../types";

type AIAdvisorPanelProps = {
  strategy: OptimizationStrategy;
  recommendation: AdvisorRecommendation;
};

export function AIAdvisorPanel({ strategy, recommendation }: AIAdvisorPanelProps) {
  return (
    <section className="border border-signal/20 bg-[linear-gradient(180deg,rgba(54,242,192,0.08),rgba(7,13,15,0.95))] p-4 shadow-glow [border-radius:6px]">
      <div className="section-title mb-3">
        <BrainCircuit size={17} className="text-signal" />
        AI Mission Planner
      </div>
      <p className="text-sm leading-6 text-slate-100">{recommendation.summary}</p>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Next action</dt>
          <dd className="mt-1 text-slate-100">{recommendation.nextAction}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Reason</dt>
          <dd className="mt-1 text-slate-300">{recommendation.reason}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Tradeoff</dt>
          <dd className="mt-1 text-slate-300">{recommendation.tradeoff}</dd>
        </div>
      </dl>
      <div className="mt-4 rounded-md border border-white/10 bg-black/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Strategy weights
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
          {Object.entries(strategy.weights).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span>{formatWeight(key)}</span>
              <span className="text-signal">{Math.round(value * 100)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatWeight(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
