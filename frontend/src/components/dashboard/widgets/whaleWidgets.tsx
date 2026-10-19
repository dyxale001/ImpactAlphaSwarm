import { useMemo } from "react";
import { ArrowUpRight, Users } from "lucide-react";
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
  formatPct,
  formatUsd,
  topTenIn,
} from "../../research/whaleFormat";
import { WidgetEmpty, WidgetHeaderLink, WidgetLoading, PinPrompt, PinnedHeader } from "./widgetChrome";

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
 * on the open market inside a month is worth noting, so it earns being the thing
 * a reader sees rather than the thing they find. It is stated as a fact, never as
 * a forecast: the page does not predict prices.
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
      <PinnedHeader ticker={ticker} setTicker={setTicker} />
      <WidgetHeaderLink to={`/asset/${ticker}?tab=insiders`}>All dealings</WidgetHeaderLink>

      {/* The stock page's notice: a bordered note, stated as a fact. */}
      {clusterCount >= CLUSTER_MIN_BUYERS ? (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-forest-900/10 p-3.5">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-brand-muted-fg">
            <span className="font-semibold text-forest-900">Insiders bought together:</span>{" "}
            {clusterCount} different insiders bought on the open market in the last{" "}
            {CLUSTER_WINDOW_DAYS} days. Several insiders buying around the same time is
            worth noting. It doesn't say what the price will do.
          </p>
        </div>
      ) : (
        <p className="as-inset px-3.5 py-3 text-xs leading-relaxed text-brand-muted-fg">
          No insiders bought together at {ticker} in the last {CLUSTER_WINDOW_DAYS} days.{" "}
          {clusterCount === 1
            ? "One insider bought on the open market, which on its own says less."
            : "It takes at least two separate buyers to count."}
        </p>
      )}

      {openMarketBuys.length > 0 ? (
        <ul className="divide-y divide-forest-900/8 rounded-[12px] border border-forest-900/10">
          {openMarketBuys.map((t, i) => (
            <li key={`${t.name}-${t.filing_date}-${i}`} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="chip chip-up shrink-0">
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                Bought
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-forest-900">{formatName(t.name)}</p>
                <p className="text-xs text-brand-muted-fg">filed {formatDate(t.filing_date)}</p>
              </div>
              <p className="shrink-0 text-sm font-bold tabular-nums text-forest-900">{formatUsd(t.value)}</p>
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
      <WidgetHeaderLink to={`/asset/${ticker}?tab=investors`}>All holders</WidgetHeaderLink>

      {/* The two headline percentages, as the Big investors tab's summary tiles. */}
      <dl className="grid grid-cols-2 gap-2">
        {[
          ["Institutions", data.institutions_pct],
          ["Insiders", data.insiders_pct],
        ].map(([label, value]) => (
          <div key={label as string} className="as-inset flex flex-col gap-1 p-3">
            <dt className="text-xs text-brand-muted-fg">{label}</dt>
            <dd className="text-xl font-bold tabular-nums tracking-[-0.01em] text-forest-900">
              {formatPct(value as number | null)}
            </dd>
          </div>
        ))}
      </dl>

      {holders.length === 0 ? (
        <WidgetEmpty message={`No 13F holders on record for ${ticker}.`} />
      ) : (
        <ul className="divide-y divide-forest-900/8 rounded-[12px] border border-forest-900/10">
          {holders.map((h, i) => {
            const share =
              largestHeld > 0 ? ((h.pct_held ?? 0) / largestHeld) * 100 : 0;
            return (
              <li key={`${h.holder}-${i}`} className="px-3.5 py-2.5">
                <div className="flex items-baseline gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-forest-900">{h.holder}</p>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-forest-900">{formatPct(h.pct_held)}</p>
                </div>
                {h.pct_held != null ? (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-forest-900/8">
                    <div className="h-full rounded-full bg-forest-700" style={{ width: `${share}%` }} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* 13F filings lag by up to 45 days, so a reader should never take these as
          today's positions. The page this came from says so and so does this. */}
      <p className="text-xs leading-relaxed text-brand-muted-fg">
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
      <WidgetHeaderLink to="/whale-watching">All funds</WidgetHeaderLink>
      <ol className="divide-y divide-forest-900/8 rounded-[12px] border border-forest-900/10">
        {top.map((fund, i) => {
          const share =
            largest > 0 ? ((fund.total_value ?? 0) / largest) * 100 : 0;
          return (
            <li key={fund.fund} className="flex items-start gap-3 px-3.5 py-2.5">
              <span className="w-4 shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums text-brand-muted-fg">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-forest-900">{fund.fund}</p>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-forest-900">{formatUsd(fund.total_value)}</p>
                </div>
                <p className="text-xs text-brand-muted-fg">{topTenIn(fund.positions.length)}</p>
                <div
                  className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-forest-900/8"
                  role="img"
                  aria-label={`${Math.round(share)}% of the largest holding shown`}
                >
                  <div className="h-full rounded-full bg-forest-700" style={{ width: `${share}%` }} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
