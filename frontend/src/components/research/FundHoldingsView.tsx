import { useState } from "react";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useTopFunds } from "../../hooks/useTopFunds";
import type { FundHolding } from "../../services/api/analysis";

// "Top Funds" tab — the largest fund holders across all tracked companies, each
// with their biggest positions. Scoped to companies AlphaSwarm covers.

function fmtMoney(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

const INITIAL = 5;

function FundCard({ fund }: { fund: FundHolding }) {
  const [expanded, setExpanded] = useState(false);
  const positions = expanded ? fund.positions : fund.positions.slice(0, INITIAL);

  return (
    <div className="soft-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-brand-fg flex items-center gap-1.5 min-w-0">
          <Building2 className="w-3.5 h-3.5 text-brand-primary shrink-0" />
          <span className="truncate">{fund.fund}</span>
        </p>
        <div className="text-right shrink-0">
          <p className="text-sm font-mono font-semibold text-brand-fg">
            {fmtMoney(fund.total_value)}
          </p>
          <p className="text-[11px] text-brand-muted-fg">
            {fund.positions.length}{" "}
            {fund.positions.length === 1 ? "company" : "companies"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {positions.map((p, i) => (
          <div
            key={`${p.ticker}-${i}`}
            className="flex items-center gap-3 rounded-xl border border-brand-border/50 bg-brand-bg/50 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <p className="flex items-baseline gap-2">
                <span className="text-sm font-bold font-mono text-brand-fg">
                  {p.ticker}
                </span>
                {p.universe && (
                  <span className="text-[10px] text-brand-muted-fg truncate">
                    {p.universe}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-brand-muted-fg">
                {fmtPct(p.pct_held)} of company
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono text-brand-fg">
                {fmtMoney(p.value)}
              </p>
              {p.pct_change != null && p.pct_change !== 0 && (
                <p
                  className={`text-[11px] font-mono flex items-center justify-end gap-0.5 ${
                    p.pct_change > 0
                      ? "text-brand-primary"
                      : "text-semantic-danger"
                  }`}
                >
                  {p.pct_change > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {`${p.pct_change > 0 ? "+" : ""}${(p.pct_change * 100).toFixed(1)}%`}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {fund.positions.length > INITIAL && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-border/60 bg-brand-bg/55 px-3 py-2 text-xs font-semibold text-brand-muted-fg hover:text-brand-fg hover:border-brand-primary/40 transition-colors"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Show all {fund.positions.length} holdings{" "}
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default function FundHoldingsView() {
  const { funds, isLoading, error } = useTopFunds();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-40 rounded-2xl bg-brand-bg/55 animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-brand-muted-fg italic py-2">{error}</p>;
  }
  if (funds.length === 0) {
    return (
      <p className="text-sm text-brand-muted-fg italic py-2">
        No fund holdings available yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-brand-muted-fg">
        The largest fund holders across all tracked companies, and where they're
        most invested. Scoped to companies AlphaSwarm covers.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {funds.slice(0, 25).map((fund) => (
          <FundCard key={fund.fund} fund={fund} />
        ))}
      </div>
    </div>
  );
}
