import { useState } from "react";
import { Building2, ChevronRight, ChevronDown, ArrowLeft } from "lucide-react";
import { useTopFunds } from "../../hooks/useTopFunds";
import type { FundHolding } from "../../services/api/analysis";
import { sectorColour } from "../../utils/sectorColours";
import { HolderChange } from "./InstitutionalOwners";
import { SummaryStrip } from "./sourcePageControls";
import { formatPct, formatUsd, topTenIn } from "./whaleFormat";

// "Top Funds" tab — the largest fund holders across all tracked companies,
// ranked by what they hold. Clicking one opens its positions.
//
// Laid out as a league table rather than a grid of cards, because the
// distribution demands it: of ~106 funds, only about 9 hold more than 20 of our
// companies and the median fund holds exactly one. Equal-sized cards gave a
// single-position filer the same visual weight as BlackRock with 58, which read
// as an unordered wall. Ranked rows put the significant holders at the top and
// let the long tail stay compact.
//
// Both views are built from the stock page's Big investors tab, so a holder reads
// the same in either place: one card with a 16px title, the figures as the shared
// tiles, a bordered list or table with a forest-50 header (stacked rows on a
// phone), changes in green and red, and the 13F lag said once at the card's foot.

// Rows shown before the list asks to be expanded. Comfortably covers every fund
// with a meaningful number of positions.
const INITIAL_FUNDS = 15;
// Positions shown on the detail page before expanding. The biggest funds hold
// close to 60.
const INITIAL_POSITIONS = 24;

// Fallback for older cached payloads that predate the backend `description` field.
const FUND_BLURB_FALLBACK =
  "An institutional investment firm that buys and holds shares in companies on behalf of its clients.";

// 13F filings are quarterly and land up to 45 days after quarter-end, so fund
// holdings are always a lagging snapshot. At the card's foot, as the Big investors
// tab says it.
function LagCaveat() {
  return (
    <p className="border-t border-forest-900/10 pt-4 text-xs leading-relaxed text-brand-muted-fg">
      Built from 13F filings, submitted quarterly and up to 45 days after the quarter
      ends, so a fund may have traded since it last reported. A big investor holding a
      stock doesn't by itself mean it's a good investment.
    </p>
  );
}

function FundIcon({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-forest-800 ${
        size === "lg" ? "h-11 w-11 rounded-[12px]" : "h-8 w-8 rounded-[10px]"
      }`}
      aria-hidden="true"
    >
      <Building2 className={`${size === "lg" ? "h-5 w-5" : "h-4 w-4"} text-brand-bg`} />
    </span>
  );
}

function ShowMore({
  expanded,
  total,
  noun,
  onToggle,
}: {
  expanded: boolean;
  total: number;
  noun: string;
  onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle} className="as-btn as-btn-sm as-btn-secondary w-full">
      {expanded ? (
        <>
          Show fewer <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
        </>
      ) : (
        <>
          Show all {total} {noun} <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </>
      )}
    </button>
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
    <li>
      <button
        type="button"
        onClick={() => onOpen(fund)}
        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-forest-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-primary"
      >
        {/* The rank is what makes this read as ordered rather than as a pile. */}
        <span className="hidden w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-brand-muted-fg sm:block">
          {rank}
        </span>
        <FundIcon />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-forest-900">{fund.fund}</p>
          <p className="line-clamp-2 text-xs leading-relaxed text-brand-muted-fg sm:line-clamp-1">
            {fund.description || FUND_BLURB_FALLBACK}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-forest-900">{formatUsd(fund.total_value)}</p>
          <p className="text-xs text-brand-muted-fg">{topTenIn(count)}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-brand-muted-fg transition-colors group-hover:text-forest-900" />
      </button>
    </li>
  );
}

function SectorName({ universe }: { universe: string | null }) {
  if (!universe) return <span className="text-brand-muted-fg">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${sectorColour(universe).fill}`} aria-hidden="true" />
      {universe}
    </span>
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

  // A position is one click from the company's own insider and ownership panels
  // when the parent can navigate, rather than a dead end.
  const open = onOpenCompany
    ? (p: FundHolding["positions"][number]) => onOpenCompany(p.ticker, p.universe)
    : undefined;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-muted-fg transition-colors hover:text-brand-fg"
      >
        <ArrowLeft className="h-4 w-4" /> All funds
      </button>

      <header className="as-card space-y-4 p-4 sm:p-6">
        <h2 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-forest-900">
          <FundIcon size="lg" />
          <span className="truncate">{fund.fund}</span>
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-brand-muted-fg">
          {fund.description || FUND_BLURB_FALLBACK}
        </p>
        {/* A firm that files under several names is shown once, and says so, so
            the merged figures can be checked against each company's own list. */}
        {fund.filers && fund.filers.length > 1 && (
          <p className="text-xs leading-relaxed text-brand-muted-fg">
            Reports to the SEC under {fund.filers.length} names, combined here:{" "}
            {fund.filers.join(" and ")}.
          </p>
        )}
        {/* Labelled as top 10 holdings: each company's list stops at its ten
            largest holders, so a fund's smaller stakes are not counted. */}
        <SummaryStrip
          pills={[
            { label: "Top 10 holdings", value: formatUsd(fund.total_value), hint: "Their combined value" },
            { label: "Top 10 holder in", value: count, hint: count === 1 ? "Company" : "Companies" },
            { label: "Added", value: addedCount, hint: "Since the last filing", tone: addedCount > 0 ? "up" : undefined },
            { label: "Trimmed", value: reducedCount, hint: "Since the last filing", tone: reducedCount > 0 ? "down" : undefined },
          ]}
        />
      </header>

      <section className="as-card w-full space-y-4 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">
            Companies where it is a top 10 holder
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-brand-muted-fg">
            Largest first, with what it added or trimmed since its last filing.
            {open ? " Choose one to see its insider dealings and big investors." : ""}
          </p>
        </div>

        {/* Phones: one stacked row per position rather than a table wider than the
            screen, as on the Big investors tab. */}
        <ul className="divide-y divide-forest-900/8 overflow-hidden rounded-[12px] border border-forest-900/10 md:hidden">
          {visible.map((p, i) => {
            const row = (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-forest-900">{p.ticker}</p>
                  <p className="truncate text-xs text-brand-muted-fg">
                    {/* The figure first, so a long sector name is what truncates. */}
                    {formatPct(p.pct_held)} of company
                    {p.universe ? ` · ${p.universe}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="font-bold tabular-nums text-forest-900">{formatUsd(p.value)}</p>
                  <p className="text-xs tabular-nums"><HolderChange change={p.pct_change} /></p>
                </div>
              </>
            );
            return (
              <li key={`${p.ticker}-${i}`}>
                {open ? (
                  <button
                    type="button"
                    onClick={() => open(p)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-forest-50"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-start justify-between gap-3 px-4 py-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-hidden rounded-[12px] border border-forest-900/10 md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-forest-900/8 bg-forest-50 text-left text-xs font-semibold text-brand-muted-fg">
                <th scope="col" className="px-4 py-2.5">Company</th>
                <th scope="col" className="px-4 py-2.5">Sector</th>
                <th scope="col" className="px-4 py-2.5 text-right">Share of company</th>
                <th scope="col" className="px-4 py-2.5 text-right">Value</th>
                <th scope="col" className="px-4 py-2.5 text-right">Change last filing</th>
                {open && <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Open</span></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((p, i) => (
                <tr
                  key={`${p.ticker}-${i}`}
                  onClick={open ? () => open(p) : undefined}
                  className={`group border-b border-forest-900/8 last:border-b-0 ${open ? "cursor-pointer transition-colors hover:bg-forest-50" : ""}`}
                >
                  <td className="px-4 py-3 font-bold text-forest-900">
                    {open ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(p);
                        }}
                        className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                      >
                        {p.ticker}
                      </button>
                    ) : (
                      p.ticker
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-muted-fg"><SectorName universe={p.universe} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPct(p.pct_held)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-forest-900">{formatUsd(p.value)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums"><HolderChange change={p.pct_change} /></td>
                  {open && (
                    <td className="px-2 py-3 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-brand-muted-fg transition-colors group-hover:text-forest-900" aria-hidden="true" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {count > INITIAL_POSITIONS && (
          <ShowMore expanded={showAll} total={count} noun="holdings" onToggle={() => setShowAll((v) => !v)} />
        )}

        <LagCaveat />
      </section>
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
      <div className="as-card space-y-2 p-4 sm:p-6" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 rounded-[12px] bg-forest-50 animate-pulse" />
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
    <section className="as-card w-full space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">The largest fund holders</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-brand-muted-fg">
            Across the companies we cover, ranked by what they hold where they are one
            of a company's ten largest holders. Pick one to see where it is most invested.
          </p>
        </div>
        <span className="chip shrink-0">{funds.length} funds</span>
      </div>

      <ul className="divide-y divide-forest-900/8 overflow-hidden rounded-[12px] border border-forest-900/10">
        {visible.map((fund, i) => (
          <FundRow key={fund.fund} fund={fund} rank={i + 1} onOpen={onOpenFund} />
        ))}
      </ul>

      {funds.length > INITIAL_FUNDS && (
        <ShowMore expanded={showAll} total={funds.length} noun="funds" onToggle={() => setShowAll((v) => !v)} />
      )}

      <LagCaveat />
    </section>
  );
}
