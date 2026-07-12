import { useState } from "react";
import {
  Waves,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useWhaleData } from "../../hooks/useWhaleData";

// Large insider (director/exec) dealings for a ticker. Purely informational —
// this panel is deliberately kept out of the Unified Confidence Score. The
// "not scored" badge makes that explicit to the user.

function formatUsd(value: number | null): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatShares(shares: number): string {
  return shares.toLocaleString("en-US");
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Finnhub returns insider names upper-cased and in "LAST FIRST" order. Title-case
// them and tidy initials/suffixes; leave the token order as-is (can't reliably
// tell how many leading tokens are the surname).
function formatName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      if (w === "jr" || w === "jr.") return "Jr.";
      if (w === "sr" || w === "sr.") return "Sr.";
      if (["ii", "iii", "iv", "v"].includes(w)) return w.toUpperCase();
      if (w.replace(".", "").length === 1) return `${w.charAt(0).toUpperCase()}.`;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// SEC transaction codes (Finnhub `transactionCode`). The nature of the trade is
// what explains the missing dollar values: only open-market trades settle at a
// market price — grants, option exercises and tax withholding do not.
const TXN_NATURE: Record<string, string> = {
  P: "Open market",
  S: "Open market",
  A: "Grant",
  M: "Options",
  X: "Options",
  F: "Tax withholding",
  G: "Gift",
  D: "Sale to issuer",
  C: "Conversion",
};

function txnNature(code?: string | null): string | null {
  if (!code) return null;
  return TXN_NATURE[code.trim().toUpperCase()] ?? null;
}

// Plain-language definitions surfaced on hover so a non-expert user understands
// what each transaction type means — and why only some carry a dollar value.
const NATURE_DEFS: Record<string, string> = {
  "Open market": "A trade on the public market at the going price — the insider chose to buy or sell with their own money. The clearest read on conviction.",
  Grant: "Shares awarded as compensation (e.g. RSUs), not bought on the market — so there is no purchase price.",
  Options: "Shares acquired by exercising stock options, or the related settlement. Not an open-market purchase.",
  "Tax withholding": "Shares the company held back to cover taxes owed when equity awards vested. Routine, not a sell decision.",
  Gift: "Shares given away or received as a gift — no money changes hands.",
  "Sale to issuer": "Shares sold back directly to the company rather than on the open market.",
  Conversion: "Shares obtained by converting another security (e.g. a derivative) into common stock.",
};

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

  return (
    <section className="soft-card w-full p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1 flex items-center gap-1.5">
            <Waves className="w-3 h-3 text-brand-primary" />
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
