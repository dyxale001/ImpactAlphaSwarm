import { Fragment, useState } from "react";
import {
  Waves,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  Users,
} from "lucide-react";
import { useWhaleData } from "../../hooks/useWhaleData";
import { InsiderTracePanel } from "./InsiderTracePanel";
import {
  CLUSTER_MIN_BUYERS,
  CLUSTER_WINDOW_DAYS,
  NATURE_DEFS,
  clusterBuyerCount,
  formatDate,
  formatName,
  formatShares,
  formatUsd,
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
  variant = "page",
  showSummary = false,
}: {
  ticker: string;
  // All optional so the standalone Whale Watching page renders exactly as before.
  // The asset page's Insider trading tab sets them.
  emptyMessage?: string;
  // Adds the date the trade happened ahead of the date it was filed.
  showTradeDate?: boolean;
  // "asset" matches the asset page's other tabs, as InstitutionalOwners does: a muted
  // eyebrow with only the icon in green, body-weight description, the cluster callout
  // on the forest panel, and rows outlined in the Reasoning Trace's lime.
  variant?: "page" | "asset";
  // The AI note above the dealings. A feature rather than a look, so it is its own
  // switch. Both pages turn it on: the note is stored once per ticker, so either page
  // reads the same saved note, and a model call happens only when none fits the filings.
  showSummary?: boolean;
}) {
  const onAsset = variant === "asset";
  // Between the facts in a dealing row. A thin vertical line on the asset page, where
  // the rows are outlined cards; the standalone page keeps its dots.
  const divider = onAsset ? (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-px bg-brand-border mx-2 align-middle"
    />
  ) : (
    " · "
  );
  const { transactions, source, fetchedAt, isLoading, error } =
    useWhaleData(ticker);
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
  // code P) inside a short window is historically a stronger signal than any
  // single trade. The count itself lives in whaleFormat, shared with the
  // dashboard widget that surfaces this same alert on its own.
  const clusterCount = clusterBuyerCount(transactions);

  return (
    <section
      className={`soft-card w-full p-4 sm:p-5 space-y-4 ${
        onAsset ? "hover:border-brand-primary/30 transition-all" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          {/* Panel eyebrows carry the brand green, matching the dashboard's
              "Top Pick Today" label. Metric labels and footnotes stay muted, so
              the green marks section starts rather than colouring everything. */}
          <p
            className={`text-[10px] uppercase tracking-widest ${
              onAsset ? "text-brand-muted-fg" : "text-brand-primary"
            } font-semibold mb-1 flex items-center gap-1.5`}
          >
            <Waves className="w-3 h-3 text-brand-primary" />
            Whale Watching
          </p>
          <p
            className={`text-sm ${onAsset ? "text-brand-fg/90" : "text-brand-muted-fg"}`}
          >
            Recent insider dealings: Directors and Executives trading their own
            company's stock. Reference data for your own judgment.
          </p>
        </div>

      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-2xl bg-brand-bg/55 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-brand-muted-fg italic py-2">{error}</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-brand-muted-fg italic py-2">
          {emptyMessage ??
            `No recent insider dealings on record for ${ticker}. Insider data covers US-listed companies.`}
        </p>
      ) : (
        <div className="space-y-3">
          {showSummary && (
            <InsiderTracePanel ticker={ticker} transactions={transactions} />
          )}

          {clusterCount >= CLUSTER_MIN_BUYERS && (
            <div
              className={
                onAsset
                  ? "hero-card flex items-start gap-2 px-4 py-3"
                  : "flex items-start gap-2 rounded-2xl border border-brand-primary/30 bg-brand-primary/10 px-4 py-3"
              }
            >
              <Users
                className={`w-4 h-4 shrink-0 mt-0.5 ${onAsset ? "text-lime-500" : "text-brand-primary"}`}
              />
              <p
                className={`text-xs leading-snug ${onAsset ? "text-white" : "text-brand-fg"}`}
              >
                <span className="font-semibold">Cluster buying:</span>{" "}
                {clusterCount} different insiders bought on the open market in the
                last {CLUSTER_WINDOW_DAYS} days. Several insiders buying at once
                is historically a stronger signal than a single trade.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {visibleTransactions.map((t, i) => {
            const isBuy = t.type === "buy";
            const nature = txnNature(t.transaction_code);
            return (
              <div
                key={`${t.name}-${t.filing_date}-${i}`}
                className={`flex items-center gap-3 rounded-2xl border ${
                  onAsset ? "border-brand-accent" : "border-brand-border/60"
                } bg-brand-bg/55 px-4 py-3`}
              >
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                    onAsset
                      ? // Neon lime with forest text for a buy, solid forest with white
                        // text for a sell. Lime text on a light card is unreadable, so
                        // the lime is the fill, as the brand does everywhere else.
                        isBuy
                        ? "bg-brand-accent text-brand-fg"
                        : "bg-brand-primary text-white"
                      : isBuy
                        ? "bg-brand-primary/15 text-brand-primary"
                        : "bg-semantic-danger/15 text-semantic-danger"
                  }`}
                >
                  {isBuy ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {isBuy ? "Buy" : "Sell"}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-fg truncate">
                    {formatName(t.name)}
                    {t.role && (
                      <span className="font-normal text-brand-muted-fg">
                        {divider}
                        {t.role}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-brand-muted-fg flex items-center gap-1.5 flex-wrap mt-0.5">
                    {nature && (
                      <span className="rounded-full border border-brand-border/60 bg-brand-bg px-1.5 py-0.5 text-[10px] font-medium text-brand-muted-fg">
                        {nature}
                      </span>
                    )}
                    <span className="inline-flex items-center flex-wrap">
                      {[
                        `${formatShares(t.shares)} shares`,
                        ...(showTradeDate && t.transaction_date
                          ? [`traded ${formatDate(t.transaction_date)}`]
                          : []),
                        `filed ${formatDate(t.filing_date)}`,
                      ].map((part, index) => (
                        <Fragment key={part}>
                          {index > 0 && divider}
                          {part}
                        </Fragment>
                      ))}
                    </span>
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-semibold text-brand-fg">
                    {formatUsd(t.value)}
                  </p>
                  {t.price != null && t.price > 0 && (
                    <p className="text-xs text-brand-muted-fg font-mono">
                      @ ${t.price.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            );
            })}
          </div>

          {transactions.length > INITIAL_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-2.5 text-xs font-semibold text-brand-muted-fg hover:text-brand-fg hover:border-brand-primary/40 transition-colors"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Show all {transactions.length} dealings{" "}
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {presentNatures.length > 0 && (
        <div className="pt-3 border-t border-brand-border/50 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
            What the labels mean
          </p>
          <dl className="space-y-1.5">
            {presentNatures.map((n) => (
              <div key={n} className="flex items-baseline gap-2">
                <dt
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    onAsset
                      ? // Lime is the fill, with forest text: lime text on a light card
                        // is unreadable.
                        "bg-brand-accent text-brand-fg"
                      : "border border-brand-border/60 bg-brand-bg text-brand-muted-fg"
                  }`}
                >
                  {n}
                </dt>
                <dd className="text-xs text-brand-muted-fg leading-snug">
                  {NATURE_DEFS[n]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {source && transactions.length > 0 && (
        <div className="pt-3 border-t border-brand-border/50 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
            Source
          </span>
          <span className="text-sm font-medium text-brand-fg">
            {source} · values in USD
            {fetchedAt ? ` · updated ${formatDate(fetchedAt)}` : ""}
          </span>
        </div>
      )}
    </section>
  );
}
