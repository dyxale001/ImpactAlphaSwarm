import {
  Building2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ArrowLeft,
  Info,
} from "lucide-react";
import { useTopFunds } from "../../hooks/useTopFunds";
import type { FundHolding } from "../../services/api/analysis";

// "Top Funds" tab — the largest fund holders across all tracked companies. Each
// fund is a block explaining who they are; clicking it opens a full page listing
// that fund's positions. Scoped to companies AlphaSwarm covers.

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

// Fallback for older cached payloads that predate the backend `description` field.
const FUND_BLURB_FALLBACK =
  "An institutional investment firm that buys and holds shares in companies on behalf of its clients.";

// 13F filings are quarterly and land up to 45 days after quarter-end, so fund
// holdings are always a lagging snapshot. Shown wherever we surface them.
function LagCaveat() {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-brand-border/60 bg-brand-bg/40 px-4 py-3">
      <Info className="w-3.5 h-3.5 text-brand-muted-fg shrink-0 mt-0.5" />
      <p className="text-[11px] text-brand-muted-fg leading-snug">
        Built from 13F filings, which funds submit once a quarter and up to 45
        days after it ends. This is a lagging signal, so a fund may have traded
        since it last reported.
      </p>
    </div>
  );
}

function FundCard({
  fund,
  onOpen,
}: {
  fund: FundHolding;
  onOpen: (fund: FundHolding) => void;
}) {
  const count = fund.positions.length;

  return (
    <button
      type="button"
      onClick={() => onOpen(fund)}
      className="soft-card p-4 w-full text-left group hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.99]"
    >
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
            {count} {count === 1 ? "company" : "companies"}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs text-brand-muted-fg leading-relaxed">
        {fund.description || FUND_BLURB_FALLBACK}
      </p>

      <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary group-hover:gap-1.5 transition-all">
        View {count} holdings
        <ChevronRight className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

function PositionRow({
  p,
  onOpenCompany,
}: {
  p: FundHolding["positions"][number];
  onOpenCompany?: (ticker: string, universe: string | null) => void;
}) {
  // Clickable when the parent can navigate, so a position is one click from the
  // company's own insider and ownership panels rather than a dead end.
  const Tag = onOpenCompany ? "button" : "div";
  return (
    <Tag
      {...(onOpenCompany
        ? {
            type: "button" as const,
            onClick: () => onOpenCompany(p.ticker, p.universe),
          }
        : {})}
      className={`w-full text-left flex items-center gap-3 rounded-xl border border-brand-border/50 bg-brand-bg/50 px-3 py-2.5 ${
        onOpenCompany
          ? "hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.99]"
          : ""
      }`}
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
        <p className="text-sm font-mono text-brand-fg">{fmtMoney(p.value)}</p>
        {p.pct_change != null && p.pct_change !== 0 && (
          <p
            className={`text-[11px] font-mono flex items-center justify-end gap-0.5 ${
              p.pct_change > 0 ? "text-brand-primary" : "text-semantic-danger"
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
    </Tag>
  );
}

// Full-page listing of a single fund's positions, reached by clicking a fund card.
export function FundHoldingsDetail({
  fund,
  onBack,
  onOpenCompany,
}: {
  fund: FundHolding;
  onBack: () => void;
  onOpenCompany?: (ticker: string, universe: string | null) => void;
}) {
  const count = fund.positions.length;
  const addedCount = fund.positions.filter((p) => (p.pct_change ?? 0) > 0).length;
  const reducedCount = fund.positions.filter(
    (p) => (p.pct_change ?? 0) < 0,
  ).length;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> All funds
      </button>

      <div className="soft-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold text-brand-fg flex items-center gap-2 min-w-0">
            <Building2 className="w-6 h-6 text-brand-primary shrink-0" />
            <span className="truncate">{fund.fund}</span>
          </h2>
          <div className="text-right shrink-0">
            <p className="text-lg font-mono font-semibold text-brand-fg">
              {fmtMoney(fund.total_value)}
            </p>
            <p className="text-xs text-brand-muted-fg">
              {count} {count === 1 ? "company" : "companies"}
            </p>
          </div>
        </div>
        <p className="text-sm text-brand-muted-fg leading-relaxed">
          {fund.description || FUND_BLURB_FALLBACK}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
            Holdings in companies we cover
          </p>
          {(addedCount > 0 || reducedCount > 0) && (
            <p className="text-[11px] text-brand-muted-fg flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-brand-primary font-medium">
                <TrendingUp className="w-3 h-3" />
                {addedCount} added
              </span>
              <span className="inline-flex items-center gap-1 text-semantic-danger font-medium">
                <TrendingDown className="w-3 h-3" />
                {reducedCount} trimmed
              </span>
              <span className="text-brand-muted-fg">last filing</span>
            </p>
          )}
        </div>
        {fund.positions.map((p, i) => (
          <PositionRow
            key={`${p.ticker}-${i}`}
            p={p}
            onOpenCompany={onOpenCompany}
          />
        ))}
      </div>

      <LagCaveat />
    </div>
  );
}

export default function FundHoldingsView({
  onOpenFund,
}: {
  onOpenFund: (fund: FundHolding) => void;
}) {
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
        The largest fund holders across all tracked companies. Tap a fund to see
        where it's most invested. Scoped to companies AlphaSwarm covers.
      </p>
      <LagCaveat />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {funds.slice(0, 25).map((fund) => (
          <FundCard key={fund.fund} fund={fund} onOpen={onOpenFund} />
        ))}
      </div>
    </div>
  );
}
