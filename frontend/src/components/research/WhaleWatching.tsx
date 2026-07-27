import { useState } from "react";
import {
  Waves,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  Users,
} from "lucide-react";
import { useWhaleData } from "../../hooks/useWhaleData";
import {
  NATURE_DEFS,
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

export default function WhaleWatching({ ticker }: { ticker: string }) {
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
  // single trade.
  const omBuys = transactions.filter(
    (t) => (t.transaction_code || "").trim().toUpperCase() === "P",
  );
  const DAY_MS = 86_400_000;
  const now = Date.now();
  const within30Days = (t: (typeof transactions)[number]) => {
    const d = new Date(t.transaction_date || t.filing_date || "");
    return !Number.isNaN(d.getTime()) && now - d.getTime() <= 30 * DAY_MS;
  };
  const recentBuyers = new Set(
    omBuys.filter(within30Days).map((t) => t.name.trim().toUpperCase()),
  );
  const clusterCount = recentBuyers.size;

  return (
    <section className="soft-card w-full p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          {/* Panel eyebrows carry the brand green, matching the dashboard's
              "Top Pick Today" label. Metric labels and footnotes stay muted, so
              the green marks section starts rather than colouring everything. */}
          <p className="text-[10px] uppercase tracking-widest text-brand-primary font-semibold mb-1 flex items-center gap-1.5">
            <Waves className="w-3 h-3" />
            Whale Watching
          </p>
          <p className="text-sm text-brand-muted-fg">
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
          No recent insider dealings on record for {ticker}. Insider data covers
          US-listed companies.
        </p>
      ) : (
        <div className="space-y-3">
          {clusterCount >= 2 && (
            <div className="flex items-start gap-2 rounded-2xl border border-brand-primary/30 bg-brand-primary/10 px-4 py-3">
              <Users className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
              <p className="text-xs text-brand-fg leading-snug">
                <span className="font-semibold">Cluster buying:</span>{" "}
                {clusterCount} different insiders bought on the open market in the
                last 30 days. Several insiders buying at once is historically a
                stronger signal than a single trade.
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
                className="flex items-center gap-3 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3"
              >
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                    isBuy
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
                        {" · "}
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
                    <span>
                      {formatShares(t.shares)} shares · filed{" "}
                      {formatDate(t.filing_date)}
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
                <dt className="shrink-0 rounded-full border border-brand-border/60 bg-brand-bg px-1.5 py-0.5 text-[10px] font-medium text-brand-muted-fg">
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
