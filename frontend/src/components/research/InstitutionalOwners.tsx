import { Building2, TrendingUp, TrendingDown, Info } from "lucide-react";
import { useInstitutionalData } from "../../hooks/useInstitutionalData";

// Institutional (13F) ownership for a ticker — the "big funds" behind a stock.
// Purely informational, kept out of the Unified Confidence Score.

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function fmtMoney(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fmtShares(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString("en-US");
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1">
        {label}
      </div>
      <div className="text-lg font-mono font-semibold text-brand-fg">
        {value}
      </div>
      <div className="text-[10px] text-brand-muted-fg mt-1 leading-snug">
        {hint}
      </div>
    </div>
  );
}

export default function InstitutionalOwners({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useInstitutionalData(ticker);

  const holders = data?.holders ?? [];
  const asOf = holders[0]?.date_reported ?? data?.fetched_at ?? null;
  const hasData =
    !!data && (holders.length > 0 || data.institutions_pct != null);

  // Direction of travel from the latest 13F: how many holders grew vs trimmed
  // their stake. yfinance only lists current holders, so fully-exited positions
  // can't appear — we report Added / Reduced, not New / Exited, to stay honest.
  const addedCount = holders.filter((h) => (h.pct_change ?? 0) > 0).length;
  const reducedCount = holders.filter((h) => (h.pct_change ?? 0) < 0).length;

  return (
    <section className="soft-card w-full p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-brand-primary font-semibold mb-1 flex items-center gap-1.5">
            <Building2 className="w-3 h-3" />
            Institutional Owners
          </p>
          <p className="text-sm text-brand-muted-fg">
            The big investment funds that own shares in this company. They report their holdings
            to the SEC every quarter (a "13F" filing).
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-16 rounded-2xl bg-brand-bg/55 animate-pulse" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-2xl bg-brand-bg/55 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-brand-muted-fg italic py-2">{error}</p>
      ) : !hasData ? (
        <p className="text-sm text-brand-muted-fg italic py-2">
          No institutional ownership data on record for {ticker}. Coverage is
          US-listed companies.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Ownership summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile
              label="Held by institutions"
              value={fmtPct(data!.institutions_pct)}
              hint="Share of the company owned by funds, banks & pensions"
            />
            <StatTile
              label="Institutions"
              value={data!.institutions_count?.toLocaleString("en-US") ?? "—"}
              hint="Number of funds holding the stock"
            />
            <StatTile
              label="Insiders hold"
              value={fmtPct(data!.insiders_pct)}
              hint="Owned by the company's own execs & directors"
            />
          </div>

          {/* Top holders */}
          {holders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] uppercase tracking-widest text-brand-primary font-semibold">
                  Top holders
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
                    <span className="text-brand-muted-fg">this filing</span>
                  </p>
                )}
              </div>
              {holders.map((h, i) => (
                <div
                  key={`${h.holder}-${i}`}
                  className="flex items-center gap-3 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-fg truncate">
                      {h.holder}
                    </p>
                    <p className="text-xs text-brand-muted-fg">
                      {fmtShares(h.shares)} shares · {fmtPct(h.pct_held)} of
                      company
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold text-brand-fg">
                      {fmtMoney(h.value)}
                    </p>
                    {h.pct_change != null && h.pct_change !== 0 && (
                      <p
                        className={`text-xs font-mono flex items-center justify-end gap-0.5 ${
                          h.pct_change > 0
                            ? "text-brand-primary"
                            : "text-semantic-danger"
                        }`}
                      >
                        {h.pct_change > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {`${h.pct_change > 0 ? "+" : ""}${(h.pct_change * 100).toFixed(1)}%`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lagging-signal caveat — 13F filings arrive quarterly and up to 45
              days after quarter-end, so this is a snapshot of the past. */}
          <div className="flex items-start gap-2 rounded-2xl border border-brand-border/60 bg-brand-bg/40 px-4 py-3">
            <Info className="w-3.5 h-3.5 text-brand-muted-fg shrink-0 mt-0.5" />
            <p className="text-[11px] text-brand-muted-fg leading-snug">
              13F filings are a lagging signal: funds report only once a quarter,
              up to 45 days after it ends, so they may have traded since. Treat
              this as a snapshot of the last filing{asOf ? ` (${fmtDate(asOf)})` : ""},
              not today's positions.
            </p>
          </div>

          {/* Source */}
          <div className="pt-3 border-t border-brand-border/50 flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
              Source
            </span>
            <span className="text-sm font-medium text-brand-fg">
              {data!.source ?? "yfinance"} · as of {fmtDate(asOf)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
