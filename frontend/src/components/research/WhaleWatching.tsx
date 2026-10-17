import { Fragment, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  Users,
} from "lucide-react";
import { useWhaleData } from "../../hooks/useWhaleData";
import { InsiderTracePanel } from "./InsiderTracePanel";
import { SummaryStrip } from "./sourcePageControls";
import type { WhaleTransactionDTO } from "../../services/api/analysis";
import {
  CLUSTER_MIN_BUYERS,
  CLUSTER_WINDOW_DAYS,
  NATURE_DEFS,
  clusterBuyerCount,
  dealingCounts,
  formatDate,
  formatName,
  formatShares,
  formatUsd,
  isOpenMarket,
  txnNature,
} from "./whaleFormat";

// Large insider (director/exec) dealings for a ticker. Purely informational —
// this panel is deliberately kept out of the Unified Confidence Score. The
// "not scored" badge makes that explicit to the user.
//
// Formatting lives in ./whaleFormat so this panel and the cross-company
// activity feed render the same rows identically.

export default function WhaleWatching({
  ticker,
  emptyMessage,
  showTradeDate = false,
  showSummary = false,
}: {
  ticker: string;
  emptyMessage?: string;
  // Adds the date the trade happened ahead of the date it was filed.
  showTradeDate?: boolean;
  // The AI note above the dealings. A feature rather than a look, so it is its own
  // switch. Both pages turn it on: the note is stored once per ticker, so either page
  // reads the same saved note, and a model call happens only when none fits the filings.
  showSummary?: boolean;
}) {
  const {
    transactions,
    source,
    windowDays,
    summaryEnabled,
    fetchedAt,
    isLoading,
    error,
  } = useWhaleData(ticker);
  // The span the server kept, said wherever the panel claims anything about it. Absent
  // only on an answer cached before the window existed.
  const span = windowDays ? `in the last ${windowDays} days` : null;
  const [expanded, setExpanded] = useState(false);

  // Show only the most recent few by default; the rest expand on demand.
  const INITIAL_COUNT = 5;
  const visibleTransactions = expanded
    ? transactions
    : transactions.slice(0, INITIAL_COUNT);

  // Distinct transaction types among the visible rows, so the legend explains
  // each type once rather than repeating a tooltip on every (duplicated) row.
  const presentNatures = Array.from(
    new Set(
      visibleTransactions
        .map((t) => txnNature(t.transaction_code))
        .filter((n): n is string => Boolean(n)),
    ),
  );

  // Cluster buying: several different insiders buying on the open market (SEC
  // code P) inside a short window, stated as a fact and never as a forecast. The
  // count itself lives in whaleFormat, shared with the dashboard widget that
  // surfaces this same alert on its own.
  const clusterCount = clusterBuyerCount(transactions);

  return (
    <AssetInsiders
      ticker={ticker}
      transactions={transactions}
      visibleTransactions={visibleTransactions}
      presentNatures={presentNatures}
      clusterCount={clusterCount}
      expanded={expanded}
      setExpanded={setExpanded}
      initialCount={INITIAL_COUNT}
      span={span}
      source={source}
      fetchedAt={fetchedAt}
      isLoading={isLoading}
      error={error}
      emptyMessage={emptyMessage}
      showSummary={showSummary && summaryEnabled !== false}
      showTradeDate={showTradeDate}
    />
  );

}

// The stock page's Insider trading tab, laid out like Big investors: a heading, the
// dealings counted as tiles, the AI summary, a light note when insiders bought
// together, one list of dealings, the labels key on request, and one footnote.
function AssetInsiders({
  ticker,
  transactions,
  visibleTransactions,
  presentNatures,
  clusterCount,
  expanded,
  setExpanded,
  initialCount,
  span,
  source,
  fetchedAt,
  isLoading,
  error,
  emptyMessage,
  showSummary,
  showTradeDate,
}: {
  ticker: string;
  transactions: WhaleTransactionDTO[];
  visibleTransactions: WhaleTransactionDTO[];
  presentNatures: string[];
  clusterCount: number;
  expanded: boolean;
  setExpanded: (fn: (v: boolean) => boolean) => void;
  initialCount: number;
  span: string | null;
  source: string | null;
  fetchedAt: string | null;
  isLoading: boolean;
  error: string | null;
  emptyMessage?: string;
  showSummary: boolean;
  showTradeDate: boolean;
}) {
  const [showKey, setShowKey] = useState(false);
  const counts = dealingCounts(transactions);
  const divider = <span aria-hidden="true" className="mx-1.5 text-forest-900/25">·</span>;

  return (
    <section className="as-card w-full space-y-5 p-4 sm:p-6">
      <div>
        <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">Insider trading</h2>
        <p className="mt-1 text-xs leading-relaxed text-brand-muted-fg">
          Shares the company's own directors and executives bought or sold{" "}
          {span ?? "recently"}, from the SEC Form 4 filings they must make after a trade.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-[12px] bg-forest-50 animate-pulse" />
          <div className="h-32 rounded-[12px] bg-forest-50 animate-pulse" />
        </div>
      ) : error ? (
        <p className="text-sm text-brand-muted-fg italic">{error}</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-brand-muted-fg italic">
          {emptyMessage ??
            `No insider dealings ${span ?? "recently"} on record for ${ticker}. Insider data covers US-listed companies.`}
        </p>
      ) : (
        <>
          <SummaryStrip
            pills={[
              { label: "Open-market buys", value: counts.purchases, hint: "Bought at the market price" },
              { label: "Open-market sales", value: counts.sales, hint: "Sold at the market price" },
              { label: "Routine entries", value: counts.routine, hint: "Grants, options and tax" },
            ]}
          />

          {showSummary && (
            <InsiderTracePanel ticker={ticker} transactions={transactions} showFigures={false} />
          )}

          {/* Several insiders buying around the same time, stated as a fact. It used
              to call this "historically a stronger signal", which reads as a
              forecast, and the page does not predict prices. */}
          {clusterCount >= CLUSTER_MIN_BUYERS && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-forest-900/10 p-3.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-brand-muted-fg">
                <span className="font-semibold text-forest-900">Insiders bought together:</span>{" "}
                {clusterCount} different insiders bought on the open market in the last{" "}
                {CLUSTER_WINDOW_DAYS} days. Several insiders buying around the same time is
                worth noting. It doesn't say what the price will do.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <ul className="divide-y divide-forest-900/8 rounded-[12px] border border-forest-900/10">
              {visibleTransactions.map((t, i) => {
                const isBuy = t.type === "buy";
                const nature = txnNature(t.transaction_code);
                // Only an open-market trade is a decision to buy or sell. Anything
                // else is named for what it is, in a neutral chip.
                const openMarket = isOpenMarket(t.transaction_code);
                return (
                  <li key={`${t.name}-${t.filing_date}-${i}`} className="flex items-start gap-3 px-4 py-3">
                    {openMarket ? (
                      <span className={`chip shrink-0 ${isBuy ? "chip-up" : "chip-down"}`}>
                        {isBuy ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
                        {isBuy ? "Bought" : "Sold"}
                      </span>
                    ) : (
                      <span className="chip shrink-0">{nature ?? "Other"}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-forest-900">
                        {formatName(t.name)}
                        {t.role && <span className="font-normal text-brand-muted-fg">{divider}{t.role}</span>}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-y-1 text-xs text-brand-muted-fg">
                        {nature && openMarket && <span className="chip chip-line mr-1.5">{nature}</span>}
                        {[
                          (t.lots ?? 1) > 1
                            ? `${formatShares(t.shares)} shares in ${t.lots} trades`
                            : `${formatShares(t.shares)} shares`,
                          ...(showTradeDate && t.transaction_date ? [`traded ${formatDate(t.transaction_date)}`] : []),
                          `filed ${formatDate(t.filing_date)}`,
                        ].map((part, index) => (
                          <Fragment key={part}>
                            {index > 0 && divider}
                            {part}
                          </Fragment>
                        ))}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-forest-900">{formatUsd(t.value)}</p>
                      {t.price != null && t.price > 0 && (
                        <p className="text-xs tabular-nums text-brand-muted-fg">
                          {(t.lots ?? 1) > 1 ? "avg" : "@"} ${t.price.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {transactions.length > initialCount && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                >
                  {expanded ? "Show fewer" : `Show all ${transactions.length} dealings`}
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
              )}
              {presentNatures.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-expanded={showKey}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                >
                  What the labels mean
                  <ChevronDown className={`h-4 w-4 transition-transform ${showKey ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>

            {showKey && presentNatures.length > 0 && (
              <dl className="as-inset space-y-2 p-4">
                {presentNatures.map((n) => (
                  <div key={n} className="flex items-baseline gap-2">
                    <dt className="chip chip-line shrink-0 bg-white">{n}</dt>
                    <dd className="text-xs leading-relaxed text-brand-muted-fg">{NATURE_DEFS[n]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <p className="border-t border-forest-900/10 pt-4 text-xs leading-relaxed text-brand-muted-fg">
            Source: {source ?? "SEC Form 4 filings"}, values in USD
            {fetchedAt ? `, updated ${formatDate(fetchedAt)}` : ""}. Insiders file after they
            trade, so part of any move may already have happened. An insider buying or selling
            a stock doesn't by itself mean it's a good or bad investment.
          </p>
        </>
      )}
    </section>
  );
}
