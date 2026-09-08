import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, Users } from "lucide-react";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { useWhaleData } from "../../../hooks/useWhaleData";
import { useInstitutionalData } from "../../../hooks/useInstitutionalData";
import { useTopFunds } from "../../../hooks/useTopFunds";
import {
  CLUSTER_MIN_BUYERS,
  CLUSTER_WINDOW_DAYS,
  clusterBuyerCount,
  formatDate,
  formatName,
  formatUsd,
} from "../../research/whaleFormat";
import { WidgetEmpty, WidgetLoading, PinPrompt, PinnedHeader } from "./widgetChrome";

// Whale widgets: who else is buying, and how much of the company they hold.
//
// All three are informational and deliberately outside the Unified Confidence
// Score, exactly as the pages they came from are. Nothing here feeds a ranking.

const MAX_ROWS = 5;

/**
 * Insider cluster buying for this widget's asset.
 *
 * The single most actionable thing on the dashboard, and until now it was buried
 * three levels into the whale-watching page. Several different insiders buying
 * on the open market inside a month is historically a stronger signal than any
 * one of them buying alone, so it earns being the thing a reader sees rather
 * than the thing they find.
 *
 * The threshold and the count both come from whaleFormat, shared with the panel
 * on the asset page, so the two can never disagree about what a cluster is.
 */
export function WhaleClusterWidget({
  ticker,
  setTicker,
}: WidgetProps) {
  const { transactions, isLoading, error } = useWhaleData(
    ticker ?? undefined,
  );

  const clusterCount = useMemo(
    () => clusterBuyerCount(transactions),
    [transactions],
  );

  const openMarketBuys = useMemo(
    () =>
      transactions
        .filter(
          (t) =>
            t.type === "buy" &&
            (t.transaction_code || "").trim().toUpperCase() === "P",
        )
        .slice(0, MAX_ROWS),
    [transactions],
  );

  if (!ticker) {
    return <PinPrompt what="insider dealings" setTicker={setTicker} />;
  }
  if (isLoading) return <WidgetLoading rows={3} />;
  if (error) {
    return (
      <div className="flex h-full flex-col gap-3">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
        <WidgetEmpty grow message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
        <Link
          to="/whale-watching"
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Whale watching →
        </Link>
      </div>

      {clusterCount >= CLUSTER_MIN_BUYERS ? (
        <div className="flex items-start gap-2 rounded-2xl border border-brand-primary/30 bg-brand-primary/10 px-4 py-3">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
          <p className="text-xs leading-snug text-brand-fg">
            <span className="font-semibold">Cluster buying:</span> {clusterCount}{" "}
            different insiders bought on the open market in the last{" "}
            {CLUSTER_WINDOW_DAYS} days. Several insiders buying at once is
            historically a stronger signal than a single trade.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3">
          <p className="text-xs leading-snug text-brand-muted-fg">
            No cluster buying at {ticker} in the last {CLUSTER_WINDOW_DAYS}{" "}
            days.{" "}
            {clusterCount === 1
              ? "One insider bought on the open market, which on its own says less."
              : "Insider purchases here would need at least two separate buyers to count."}
          </p>
        </div>
      )}

      {openMarketBuys.length > 0 ? (
        <ul className="space-y-2">
          {openMarketBuys.map((t, i) => (
            <li
              key={`${t.name}-${t.filing_date}-${i}`}
              className="flex items-center gap-3 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-3 py-2.5"
            >
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-primary px-2 py-1 text-[11px] font-semibold text-white">
                <ArrowUpRight className="h-3 w-3" />
                Buy
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-brand-fg">
                  {formatName(t.name)}
                </p>
                <p className="text-[11px] text-brand-muted-fg">
                  filed {formatDate(t.filing_date)}
                </p>
              </div>
              <p className="shrink-0 font-mono text-xs font-semibold text-brand-fg">
                {formatUsd(t.value)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Who institutionally owns this widget's asset, and how that is moving. */
export function InstitutionalOwnersWidget({
  ticker,
  setTicker,
}: WidgetProps) {
  const { data, isLoading, error } = useInstitutionalData(
    ticker ?? undefined,
  );

  if (!ticker) {
    return (
      <PinPrompt what="institutional ownership" setTicker={setTicker} />
    );
  }
  if (isLoading) return <WidgetLoading rows={3} />;
  if (error || !data) {
    return (
      <div className="flex h-full flex-col gap-3">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
        <WidgetEmpty
          grow
          message={error ?? "Unable to load institutional ownership."}
        />
      </div>
    );
  }

  const holders = (data.holders ?? []).slice(0, MAX_ROWS);

  // Holder bars are scaled to the biggest holder shown, the same way the top
  // funds widget scales its own, so the two whale widgets read as one family.
  const largestHeld = Math.max(0, ...holders.map((h) => h.pct_held ?? 0));

  return (
    <div className="space-y-3">
      <PinnedHeader ticker={ticker} setTicker={setTicker} />

      {/* The two headline percentages are what this widget is for, so they take
          the forest hero rather than a pair of grey tiles, split by a hairline
          instead of a gap. */}
      <div className="hero-card grid grid-cols-2 divide-x divide-white/10 overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-accent">
            Institutions
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold text-brand-bg">
            {data.institutions_pct != null
              ? `${data.institutions_pct.toFixed(1)}%`
              : "—"}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-accent">
            Insiders
          </p>
          <p className="mt-0.5 font-mono text-lg font-bold text-brand-bg">
            {data.insiders_pct != null
              ? `${data.insiders_pct.toFixed(1)}%`
              : "—"}
          </p>
        </div>
      </div>

      {holders.length === 0 ? (
        <WidgetEmpty message={`No 13F holders on record for ${ticker}.`} />
      ) : (
        <ul className="space-y-1.5">
          {holders.map((h, i) => {
            const lead = i === 0;
            const share =
              largestHeld > 0 ? ((h.pct_held ?? 0) / largestHeld) * 100 : 0;

            return (
              <li
                key={`${h.holder}-${i}`}
                className={`rounded-2xl border bg-brand-bg/55 px-3 py-2 ${
                  lead ? "border-brand-accent" : "border-brand-border/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                  <p className="min-w-0 flex-1 truncate text-xs text-brand-fg">
                    {h.holder}
                  </p>
                  <p className="shrink-0 font-mono text-xs font-semibold text-brand-primary">
                    {h.pct_held != null ? `${h.pct_held.toFixed(2)}%` : "—"}
                  </p>
                </div>

                {h.pct_held != null ? (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-brand-border/40">
                    <div
                      className={`h-full rounded-full ${
                        lead ? "bg-brand-accent" : "bg-brand-primary"
                      }`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* 13F filings lag by up to 45 days, so a reader should never take these as
          today's positions. The page this came from says so and so does this. */}
      <p className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-3 py-2.5 text-[11px] leading-relaxed text-brand-muted-fg">
        From 13F filings, which lag the market by up to 45 days.
      </p>
    </div>
  );
}

/** The largest fund positions across everything the platform tracks. */
export function TopFundsWidget() {
  const { funds, isLoading, error } = useTopFunds();

  if (isLoading) return <WidgetLoading rows={4} />;
  if (error) return <WidgetEmpty message={error} />;
  if (funds.length === 0) {
    return <WidgetEmpty message="No fund holdings on record right now." />;
  }

  const top = [...funds]
    .sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0))
    .slice(0, MAX_ROWS);

  // Every row is measured against the largest holding rather than the total, so
  // the leader's bar is always full and the rest read as a share of it. A list
  // of five near-identical numbers says much less than five bars beside them.
  const largest = top[0]?.total_value ?? 0;

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {top.map((fund, i) => {
          const share =
            largest > 0 ? ((fund.total_value ?? 0) / largest) * 100 : 0;
          // The biggest holder carries the lime accent, the rest forest. Accent
          // as a fill behind dark text rather than as text: lime on white is
          // the one place this palette has no contrast to spare.
          const lead = i === 0;

          return (
            <li
              key={fund.fund}
              className={`rounded-2xl border bg-brand-bg/55 px-3 py-2.5 ${
                lead ? "border-brand-accent" : "border-brand-border/60"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* The same disc the ranked asset rows use for their position
                    numbers, so a rank reads the same everywhere. */}
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold ${
                    lead
                      ? "bg-brand-accent text-brand-fg"
                      : "bg-brand-primary text-white"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-brand-fg">
                    {fund.fund}
                  </p>
                  <p className="text-[11px] text-brand-muted-fg">
                    {fund.positions.length} tracked position
                    {fund.positions.length === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-xs font-semibold text-brand-primary">
                  {formatUsd(fund.total_value)}
                </p>
              </div>

              <div
                className="mt-2 h-1 w-full overflow-hidden rounded-full bg-brand-border/40"
                role="img"
                aria-label={`${Math.round(share)}% of the largest holding shown`}
              >
                <div
                  className={`h-full rounded-full ${
                    lead ? "bg-brand-accent" : "bg-brand-primary"
                  }`}
                  style={{ width: `${share}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <Link
        to="/whale-watching"
        className="inline-block text-xs font-semibold text-brand-primary hover:underline"
      >
        All fund holdings →
      </Link>
    </div>
  );
}
