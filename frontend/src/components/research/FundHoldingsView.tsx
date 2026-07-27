import { useState } from "react";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Info,
} from "lucide-react";
import { useTopFunds } from "../../hooks/useTopFunds";
import type { FundHolding } from "../../services/api/analysis";

// "Top Funds" tab — the largest fund holders across all tracked companies,
// ranked by what they hold. Clicking one opens its positions.
//
// Laid out as a league table rather than a grid of cards, because the
// distribution demands it: of ~106 funds, only about 9 hold more than 20 of our
// companies and the median fund holds exactly one. Equal-sized cards gave a
// single-position filer the same visual weight as BlackRock with 58, which read
// as an unordered wall. Ranked rows put the significant holders at the top and
// let the long tail stay compact.

// Rows shown before the list asks to be expanded. Comfortably covers every fund
// with a meaningful number of positions.
const INITIAL_FUNDS = 15;
// Positions shown on the detail page before expanding. The biggest funds hold
// close to 60.
const INITIAL_POSITIONS = 24;

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

function companies(n: number): string {
  return `${n} ${n === 1 ? "company" : "companies"}`;
}

// 13F filings are quarterly and land up to 45 days after quarter-end, so fund
// holdings are always a lagging snapshot. Kept to one line: it appeared on both
// the list and the detail page as a three-line box, which was pure scroll.
function LagCaveat() {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-brand-muted-fg leading-snug">
      <Info className="w-3 h-3 shrink-0 mt-0.5" />
      <span>
        Built from 13F filings, submitted quarterly and up to 45 days after the
        quarter ends, so a fund may have traded since it last reported.
      </span>
    </p>
  );
}

function FundRow({
  fund,
  rank,
  onOpen,
}: {
  fund: FundHolding;
  rank: number;
  onOpen: (fund: FundHolding) => void;
}) {
  const count = fund.positions.length;

  return (
    <button
      type="button"
      onClick={() => onOpen(fund)}
      className="group w-full text-left flex items-center gap-3 rounded-2xl border border-brand-border/60 bg-brand-card px-4 py-3 hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.99]"
    >
      {/* The rank is what makes this read as ordered rather than as a pile. */}
      <span className="w-6 shrink-0 text-right text-xs font-mono font-semibold text-brand-muted-fg tabular-nums">
        {rank}
      </span>

      <span className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center shrink-0">
        <Building2 className="w-4 h-4 text-brand-bg" />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brand-fg truncate">
          {fund.fund}
        </p>
        <p className="text-xs text-brand-muted-fg truncate">
          {fund.description || FUND_BLURB_FALLBACK}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-mono font-semibold text-brand-primary">
          {fmtMoney(fund.total_value)}
        </p>
        <p className="text-[11px] text-brand-muted-fg">{companies(count)}</p>
      </div>

      <ChevronRight className="w-4 h-4 shrink-0 text-brand-muted-fg group-hover:text-brand-primary transition-colors" />
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
          <span className="text-sm font-bold font-mono text-brand-primary">
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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-brand-border/50 bg-brand-bg/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
        {label}
      </p>
      <p className="text-sm font-mono font-semibold text-brand-fg mt-0.5">
        {value}
      </p>
    </div>
  );
}

// Full-page listing of a single fund's positions, reached by clicking a row.
export function FundHoldingsDetail({
  fund,
  onBack,
  onOpenCompany,
}: {
  fund: FundHolding;
  onBack: () => void;
  onOpenCompany?: (ticker: string, universe: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const count = fund.positions.length;
  const addedCount = fund.positions.filter((p) => (p.pct_change ?? 0) > 0).length;
  const reducedCount = fund.positions.filter(
    (p) => (p.pct_change ?? 0) < 0,
  ).length;

  const visible = showAll
    ? fund.positions
    : fund.positions.slice(0, INITIAL_POSITIONS);

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> All funds
      </button>

      <div className="soft-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold text-brand-fg flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-xl bg-brand-primary flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-brand-bg" />
            </span>
            <span className="truncate">{fund.fund}</span>
          </h2>
        </div>

        <p className="text-sm text-brand-muted-fg leading-relaxed">
          {fund.description || FUND_BLURB_FALLBACK}
        </p>

        {/* The numbers that were previously scattered between the header and a
            line above the list, gathered into one strip. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile label="Held here" value={fmtMoney(fund.total_value)} />
          <StatTile label="Companies" value={String(count)} />
          <StatTile label="Added" value={String(addedCount)} />
          <StatTile label="Trimmed" value={String(reducedCount)} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <p className="text-[10px] uppercase tracking-widest text-brand-primary font-semibold">
            Holdings in companies we cover
          </p>
          <p className="text-[11px] text-brand-muted-fg">
            largest first · added and trimmed since the last filing
          </p>
        </div>

        {/* Two columns on wide screens: the biggest funds hold close to 60
            positions, which is an unreadable single column. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {visible.map((p, i) => (
            <PositionRow
              key={`${p.ticker}-${i}`}
              p={p}
              onOpenCompany={onOpenCompany}
            />
          ))}
        </div>

        {count > INITIAL_POSITIONS && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-2.5 text-xs font-semibold text-brand-muted-fg hover:text-brand-fg hover:border-brand-primary/40 transition-colors"
          >
            {showAll ? (
              <>
                Show fewer <ChevronDown className="w-3.5 h-3.5 rotate-180" />
              </>
            ) : (
              <>
                Show all {count} holdings <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}
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
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-brand-bg/55 animate-pulse" />
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

  const visible = showAll ? funds : funds.slice(0, INITIAL_FUNDS);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm text-brand-muted-fg max-w-xl">
          The largest fund holders across the companies we cover, ranked by what
          they hold here. Pick one to see where it is most invested.
        </p>
        <p className="text-[11px] text-brand-muted-fg shrink-0">
          {funds.length} funds
        </p>
      </div>

      <div className="space-y-2">
        {visible.map((fund, i) => (
          <FundRow
            key={fund.fund}
            fund={fund}
            rank={i + 1}
            onOpen={onOpenFund}
          />
        ))}
      </div>

      {funds.length > INITIAL_FUNDS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-2.5 text-xs font-semibold text-brand-muted-fg hover:text-brand-fg hover:border-brand-primary/40 transition-colors"
        >
          {showAll ? (
            <>
              Show fewer <ChevronDown className="w-3.5 h-3.5 rotate-180" />
            </>
          ) : (
            <>
              Show all {funds.length} funds{" "}
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}

      <LagCaveat />
    </div>
  );
}
