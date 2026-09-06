import type { ReactNode } from "react";
import { Pin } from "lucide-react";
import { useWatchlist } from "../../../dashboard/DashboardDataContext";

// Small pieces every widget shares, so an empty whale panel and an empty news
// panel read as the same product rather than as two people's work.

export function WidgetEmpty({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-border/70 px-4 py-8 text-center">
      <p className="text-xs text-brand-muted-fg leading-relaxed max-w-xs">
        {message}
      </p>
      {action}
    </div>
  );
}

export function WidgetLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 rounded-2xl bg-brand-bg/70 animate-pulse" />
      ))}
    </div>
  );
}

/**
 * What a ticker-scoped widget shows when nothing is pinned.
 *
 * Offers the user's own watched tickers as the choices rather than a search box.
 * Pinning is a dashboard-wide switch, so the useful question is "which of the
 * assets you already follow should this dashboard be about", and answering it
 * with a list of one-tap buttons keeps that a single click.
 */
export function PinPrompt({
  what,
  setPinnedTicker,
}: {
  what: string;
  setPinnedTicker: (ticker: string) => void;
}) {
  const { watchedAssets } = useWatchlist();
  const choices = watchedAssets.slice(0, 8);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-border/70 px-4 py-7 text-center">
      <Pin className="h-4 w-4 text-brand-muted-fg" />
      <p className="text-xs text-brand-muted-fg leading-relaxed max-w-xs">
        Pin an asset to see {what} for it. Every pinned widget follows the same
        asset, so you can switch the whole dashboard at once.
      </p>
      {choices.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {choices.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setPinnedTicker(asset.ticker)}
              className="rounded-full border border-brand-border/60 px-2.5 py-1 text-[11px] font-semibold font-mono text-brand-fg transition-colors hover:border-brand-primary/50 hover:bg-brand-primary/10 hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              {asset.ticker}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-brand-muted-fg">
          Add something to your watchlist first and it will show up here.
        </p>
      )}
    </div>
  );
}

/** The pinned ticker, with a way out of it. Sits at the top of every
 *  ticker-scoped widget so the reader always knows what they are looking at. */
export function PinnedHeader({
  ticker,
  setPinnedTicker,
}: {
  ticker: string;
  setPinnedTicker: (ticker: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="chip bg-brand-primary/10 text-brand-primary font-mono">
        <Pin className="h-2.5 w-2.5" />
        {ticker}
      </span>
      <button
        type="button"
        onClick={() => setPinnedTicker(null)}
        className="text-[11px] text-brand-muted-fg transition-colors hover:text-brand-fg hover:underline"
      >
        Change
      </button>
    </div>
  );
}
