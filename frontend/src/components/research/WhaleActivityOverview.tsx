import {
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useWhaleOverview } from "../../hooks/useWhaleOverview";
import type {
  AccumulationHighlight,
  ActivityFeedItem,
} from "../../services/api/analysis";
import { formatName, formatRelative, formatUsd, txnNature } from "./whaleFormat";

// The Whale Watching landing view: what is happening across every tracked
// company at once. This exists because the old page made you pick a universe
// and then a company before showing a single number, which meant you could
// never see where the activity actually was.

function HighlightTile({
  label,
  value,
  detail,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "up" | "down" | "neutral";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "up"
      ? "text-brand-primary"
      : tone === "down"
        ? "text-semantic-danger"
        : "text-brand-fg";

  const inner = (
    <>
      <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
        {label}
      </p>
      <p className={`mt-2 text-xl font-bold font-mono ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-brand-muted-fg leading-snug">{detail}</p>
    </>
  );

  if (!onClick) {
    return <div className="soft-card p-4">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="soft-card p-4 text-left hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.99]"
    >
      {inner}
    </button>
  );
}

function accumulationDetail(a: AccumulationHighlight): string {
  const pct = `${Math.abs(a.median_pct_change * 100).toFixed(1)}%`;
  const direction = a.median_pct_change >= 0 ? "grew" : "shrank";
  return `${a.company ?? a.ticker}: the typical one of its ${a.holders} reporting funds ${direction} its stake by ${pct} at the last filing.`;
}

function FeedRow({
  item,
  onOpenCompany,
}: {
  item: ActivityFeedItem;
  onOpenCompany: (ticker: string, universe: string | null) => void;
}) {
  const isBuy = item.type === "buy";
  // Same label the per-company panel shows. Without it a routine option exercise
  // or tax withholding reads as a deliberate multi-million dollar sale.
  const nature = txnNature(item.transaction_code);
  return (
    <button
      type="button"
      onClick={() => onOpenCompany(item.ticker, item.universe)}
      className="w-full text-left flex items-center gap-3 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3 hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.99]"
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
        <p className="text-sm text-brand-fg truncate">
          <span className="font-bold font-mono">{item.ticker}</span>
          <span className="text-brand-muted-fg">
            {" · "}
            {formatName(item.name)}
          </span>
          {item.role && (
            <span className="text-brand-muted-fg">
              {" · "}
              {item.role}
            </span>
          )}
        </p>
        <p className="text-xs text-brand-muted-fg flex items-center gap-1.5 flex-wrap mt-0.5">
          {nature && (
            <span className="rounded-full border border-brand-border/60 bg-brand-bg px-1.5 py-0.5 text-[10px] font-medium text-brand-muted-fg">
              {nature}
            </span>
          )}
          <span className="truncate">
            {item.company ?? item.ticker}
            {item.universe ? ` · ${item.universe}` : ""}
          </span>
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-mono font-semibold text-brand-fg">
          {formatUsd(item.value)}
        </p>
        <p className="text-[11px] text-brand-muted-fg">
          {formatRelative(item.filing_date ?? item.transaction_date)}
        </p>
      </div>
    </button>
  );
}

export default function WhaleActivityOverview({
  onOpenCompany,
  onBrowseFunds,
}: {
  onOpenCompany: (ticker: string, universe: string | null) => void;
  onBrowseFunds: () => void;
}) {
  const { overview, isLoading, error } = useWhaleOverview();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-brand-bg/55 animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-brand-bg/55 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-brand-muted-fg italic py-2">{error}</p>;
  }
  if (!overview) return null;

  const { feed, highlights, counts, new_companies: newCompanies } = overview;
  const { biggest_buy: buy, biggest_sell: sell, most_accumulated: acc } = highlights;

  const nothingYet = feed.length === 0 && !acc && newCompanies.length === 0;
  if (nothingYet) {
    return (
      <div className="soft-card p-5">
        <p className="text-sm text-brand-muted-fg">
          No whale activity on record yet. Insider dealings and institutional
          holdings are collected in the nightly refresh, so this fills in once
          that has run. In the meantime you can still browse by universe below.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Headline moves. Aggregates only, no interpretation. */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-2">
          Moving now
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {buy ? (
            <HighlightTile
              label="Biggest insider buy"
              value={formatUsd(buy.value)}
              detail={`${buy.ticker}: ${formatName(buy.name)}${
                buy.role ? `, ${buy.role}` : ""
              }, ${formatRelative(buy.filing_date ?? buy.transaction_date)}.`}
              tone="up"
              onClick={() => onOpenCompany(buy.ticker, buy.universe)}
            />
          ) : (
            <HighlightTile
              label="Biggest insider buy"
              value="—"
              detail="No insider purchases on record across the companies we cover."
            />
          )}

          {sell ? (
            <HighlightTile
              label="Biggest insider sell"
              value={formatUsd(sell.value)}
              detail={`${sell.ticker}: ${formatName(sell.name)}${
                sell.role ? `, ${sell.role}` : ""
              }, ${formatRelative(sell.filing_date ?? sell.transaction_date)}.`}
              tone="down"
              onClick={() => onOpenCompany(sell.ticker, sell.universe)}
            />
          ) : (
            <HighlightTile
              label="Biggest insider sell"
              value="—"
              detail="No insider sales on record across the companies we cover."
            />
          )}

          {acc ? (
            <HighlightTile
              label="Most bought by funds"
              value={`${acc.median_pct_change >= 0 ? "+" : ""}${(
                acc.median_pct_change * 100
              ).toFixed(1)}%`}
              detail={accumulationDetail(acc)}
              tone={acc.median_pct_change >= 0 ? "up" : "down"}
              onClick={() => onOpenCompany(acc.ticker, acc.universe)}
            />
          ) : (
            <HighlightTile
              label="Most bought by funds"
              value="—"
              detail="No institutional filings on record yet."
            />
          )}
        </div>
      </div>

      {/* Companies the discovery agent added this week. */}
      {newCompanies.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-brand-primary" />
            New this week
          </p>
          <div className="flex flex-wrap gap-2">
            {newCompanies.map((c) => (
              <button
                key={c.ticker}
                type="button"
                onClick={() => onOpenCompany(c.ticker, c.universe)}
                className="inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-semibold text-brand-fg hover:bg-brand-primary/20 transition-colors"
              >
                <span className="font-mono">{c.ticker}</span>
                <span className="font-normal text-brand-muted-fg truncate max-w-[10rem]">
                  {c.company}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The cross-company feed. */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
            Recent insider dealings
          </p>
          <p className="text-[11px] text-brand-muted-fg">
            across {counts.companies_with_insider_data} of {counts.companies}{" "}
            companies
          </p>
        </div>

        {feed.length === 0 ? (
          <p className="text-sm text-brand-muted-fg italic py-2">
            No insider dealings on record yet. Insider data covers US-listed
            companies only.
          </p>
        ) : (
          feed.map((item, i) => (
            <FeedRow
              key={`${item.ticker}-${item.name}-${item.filing_date}-${i}`}
              item={item}
              onOpenCompany={onOpenCompany}
            />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onBrowseFunds}
        className="soft-card w-full p-4 text-left group hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all active:scale-[0.99]"
      >
        <p className="text-sm font-semibold text-brand-fg flex items-center gap-2">
          <Building2 className="w-4 h-4 text-brand-primary" />
          See the funds behind these companies
          <ChevronRight className="w-4 h-4 text-brand-muted-fg group-hover:text-brand-primary transition-colors ml-auto" />
        </p>
        <p className="mt-1 text-xs text-brand-muted-fg">
          The largest institutional holders across everything we cover, and where
          each of them is most invested.
        </p>
      </button>
    </div>
  );
}
