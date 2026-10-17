import { TrendingUp, TrendingDown } from "lucide-react";
import { useInstitutionalData } from "../../hooks/useInstitutionalData";
import { InstitutionalTracePanel } from "./InstitutionalTracePanel";
import { formatDate, formatPct, formatUsd } from "./whaleFormat";
import { SummaryStrip } from "./sourcePageControls";
import type { InstitutionalHolderDTO, InstitutionalOwnershipResponse } from "../../services/api/analysis";

// Institutional (13F) ownership for a ticker — the "big funds" behind a stock.
// Purely informational, kept out of the Unified Confidence Score.

function fmtShares(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString("en-US");
}

export default function InstitutionalOwners({
  ticker,
  limit,
  showSummary = false,
}: {
  ticker: string;
  // Caps the holder list at the largest few. The stock page's Big investors tab sets
  // it; Whale Watching's company panel shows the full list.
  limit?: number;
  // The AI summary between the tiles and the holder list. A feature rather than a look,
  // so it is its own switch. Both pages turn it on and read the same summary, stored
  // once per ticker.
  showSummary?: boolean;
}) {
  const { data, isLoading, error } = useInstitutionalData(ticker);

  const allHolders = data?.holders ?? [];
  // The date comes from the full list, so capping it cannot change the as-of date.
  // The added and trimmed counts below use the capped list, so they describe the rows
  // actually on screen.
  const holders = limit ? allHolders.slice(0, limit) : allHolders;
  // The filing's own date only. It used to fall back to the day we fetched, which the
  // caveat below then called "the last filing".
  const asOf = allHolders[0]?.date_reported ?? null;
  const hasData =
    !!data && (allHolders.length > 0 || data.institutions_pct != null);

  // Direction of travel from the latest 13F: how many holders grew vs trimmed
  // their stake. yfinance only lists current holders, so fully-exited positions
  // can't appear — we report Added / Reduced, not New / Exited, to stay honest.
  const addedCount = holders.filter((h) => (h.pct_change ?? 0) > 0).length;
  const reducedCount = holders.filter((h) => (h.pct_change ?? 0) < 0).length;

  return (
    <AssetInvestors
      ticker={ticker}
      data={data}
      isLoading={isLoading}
      error={error}
      hasData={hasData}
      holders={holders}
      asOf={asOf}
      addedCount={addedCount}
      reducedCount={reducedCount}
      showSummary={showSummary}
    />
  );

}

/** A holder's change since the last filing, green up and red down; shared with
 *  the fund page so a change reads the same on both. */
export function HolderChange({ change }: { change: number | null }) {
  if (change == null || change === 0) return <span className="text-brand-muted-fg">—</span>;
  const up = change > 0;
  return (
    <span className={`inline-flex items-center justify-end gap-0.5 font-semibold ${up ? "text-up" : "text-down"}`}>
      {up ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {`${up ? "+" : ""}${(change * 100).toFixed(1)}%`}
    </span>
  );
}

// The stock page's Big investors tab, laid out like its other tabs: a heading with
// the filing's lag stated, the three figures as tiles, the AI summary, the largest
// holders as a table (stacked rows on a phone), and one footnote.
function AssetInvestors({
  ticker,
  data,
  isLoading,
  error,
  hasData,
  holders,
  asOf,
  addedCount,
  reducedCount,
  showSummary,
}: {
  ticker: string;
  data: InstitutionalOwnershipResponse | null | undefined;
  isLoading: boolean;
  error: string | null;
  hasData: boolean;
  holders: InstitutionalHolderDTO[];
  asOf: string | null;
  addedCount: number;
  reducedCount: number;
  showSummary: boolean;
}) {
  return (
    <section className="as-card w-full space-y-5 p-4 sm:p-6">
      <div>
        <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">Big investors</h2>
        <p className="mt-1 text-xs leading-relaxed text-brand-muted-fg">
          Funds, banks and pension managers that report owning the stock. They file
          every quarter (a 13F filing), up to 45 days after it ends, so this can be
          that far behind.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-[12px] bg-forest-50 animate-pulse" />
          <div className="h-32 rounded-[12px] bg-forest-50 animate-pulse" />
        </div>
      ) : error ? (
        <p className="text-sm text-brand-muted-fg italic">{error}</p>
      ) : !hasData || !data ? (
        <p className="text-sm text-brand-muted-fg italic">
          No institutional ownership data on record for {ticker}. Coverage is US-listed
          companies.
        </p>
      ) : (
        <>
          <SummaryStrip
            pills={[
              { label: "Held by institutions", value: formatPct(data.institutions_pct), hint: "Of all shares" },
              {
                label: "Institutions",
                value: data.institutions_count?.toLocaleString("en-US") ?? "—",
                hint: "Report holding it",
              },
              { label: "Held by insiders", value: formatPct(data.insiders_pct), hint: "Directors and executives" },
            ]}
          />

          {showSummary && data.summary_enabled !== false && <InstitutionalTracePanel ticker={ticker} />}

          {holders.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-forest-900">Top holders</h3>
                {(addedCount > 0 || reducedCount > 0) && (
                  <p className="flex items-center gap-2 text-xs text-brand-muted-fg">
                    <span className="inline-flex items-center gap-1 font-semibold text-up">
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                      {addedCount} added
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-down">
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                      {reducedCount} trimmed
                    </span>
                    this filing
                  </p>
                )}
              </div>

              {/* Phones: one stacked row per holder rather than a table wider than
                  the screen. */}
              <ul className="divide-y divide-forest-900/8 rounded-[12px] border border-forest-900/10 md:hidden">
                {holders.map((h, i) => (
                  <li key={`${h.holder}-${i}`} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-forest-900">{h.holder}</p>
                      <p className="text-xs text-brand-muted-fg">
                        {fmtShares(h.shares)} shares · {formatPct(h.pct_held)} of company
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p className="font-bold tabular-nums text-forest-900">{formatUsd(h.value)}</p>
                      <p className="text-xs tabular-nums"><HolderChange change={h.pct_change} /></p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-hidden rounded-[12px] border border-forest-900/10 md:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-forest-900/8 bg-forest-50 text-left text-xs font-semibold text-brand-muted-fg">
                      <th scope="col" className="px-4 py-2.5">Holder</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Shares</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Share of company</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Value</th>
                      <th scope="col" className="px-4 py-2.5 text-right">Change last filing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map((h, i) => (
                      <tr key={`${h.holder}-${i}`} className="border-b border-forest-900/8 last:border-b-0">
                        <td className="px-4 py-3 font-semibold text-forest-900">{h.holder}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fmtShares(h.shares)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPct(h.pct_held)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-forest-900">{formatUsd(h.value)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums"><HolderChange change={h.pct_change} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* The lag, the source and the caveat, said once at the foot. */}
          <p className="border-t border-forest-900/10 pt-4 text-xs leading-relaxed text-brand-muted-fg">
            A snapshot of the last 13F filing{asOf ? ` (${formatDate(asOf)})` : ""}, not today's
            positions: funds may have traded since. Source: {data.source ?? "yfinance"}. A big
            investor holding a stock doesn't by itself mean it's a good investment.
          </p>
        </>
      )}
    </section>
  );
}
