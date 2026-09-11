import type { ReactNode } from "react";
import { Target } from "lucide-react";
import { useSignals } from "../../../dashboard/DashboardDataContext";

// Small pieces every widget shares, so an empty whale panel and an empty news
// panel read as the same product rather than as two people's work.

export function WidgetEmpty({
  message,
  action,
  grow = false,
}: {
  message: string;
  action?: ReactNode;
  /**
   * Fill the height left in the card rather than hugging the text.
   *
   * Opt-in, because it is only right when this box IS the widget's content: a
   * widget stretched by a taller neighbour in its grid row would otherwise show
   * a short dashed outline floating above bare card. Where the box sits under
   * something else in ordinary flow — the watchlist's, below its search — it
   * should stay the size of its message.
   */
  grow?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-accent px-4 py-8 text-center ${
        grow ? "flex-1" : ""
      }`}
    >
      <p className="text-xs text-brand-muted-fg leading-relaxed max-w-xs">
        {message}
      </p>
      {action}
    </div>
  );
}

export function WidgetLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status">
      <span className="sr-only">Loading widget content…</span>
      <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 rounded-2xl bg-brand-bg/70 animate-pulse" />
      ))}
      </div>
    </div>
  );
}

/**
 * What a ticker-scoped widget shows before an asset has been chosen for it.
 *
 * Every asset the latest run scored is offered here, in rank order, as a
 * one-tap button. Previously this listed only the reader's watchlist, which
 * made pointing a widget at an asset a three-step errand: leave the dashboard,
 * search for the asset, add it, come back. The run has already scored
 * everything worth looking at, so there is nothing to search for and nothing to
 * add — the options are simply the run's own results.
 *
 * The choice belongs to this widget alone. Two sentiment widgets can sit side
 * by side on different assets, and picking one here changes nothing else on the
 * page.
 */
export function PinPrompt({
  what,
  setTicker,
}: {
  what: string;
  setTicker: (ticker: string) => void;
}) {
  // recommendations, not filteredRecs: the latter drops rank one and narrows to
  // whatever the assets page's search box holds, and neither belongs in a
  // picker that is meant to offer the whole run.
  const { recommendations, isLoadingRecs, isRunInProgress } = useSignals();

  return (
    // flex-1 without a height: this box is always the whole of its widget, and
    // the frame gives it a flex column to grow inside. That is what keeps the
    // dashed outline the full height of a card stretched by a taller neighbour.
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-accent px-4 py-7 text-center">
      <Target className="h-4 w-4 text-brand-muted-fg" />
      <p className="text-xs text-brand-muted-fg leading-relaxed max-w-xs">
        Choose an asset to see {what} for it. This sets the asset for this
        widget only, so the rest of your dashboard stays where it is.
      </p>

      {isLoadingRecs ? (
        <p className="text-[11px] text-brand-muted-fg">Loading the latest run…</p>
      ) : recommendations.length > 0 ? (
        // A run scores about thirty names, which is more than fits in a widget
        // that is often two columns wide, so the list scrolls rather than
        // pushing the rest of the dashboard down.
        <div className="max-h-40 w-full overflow-y-auto">
          <div className="flex flex-wrap justify-center gap-1.5">
            {recommendations.map((asset) => (
              <button
                key={asset.assetId}
                type="button"
                onClick={() => setTicker(asset.ticker)}
                title={asset.name}
                className="rounded-full bg-brand-primary px-2.5 py-1 text-[11px] font-semibold font-mono text-white transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
              >
                {asset.ticker}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-brand-muted-fg">
          {isRunInProgress
            ? "An analysis run is in progress. The assets it scores appear here as soon as it lands."
            : "No completed analysis run yet. Once one finishes, everything it scores can be chosen here."}
        </p>
      )}
    </div>
  );
}

/** This widget's chosen ticker, with a way out of it. Sits at the top of every
 *  ticker-scoped widget so the reader always knows which asset THIS card is
 *  showing, now that two of them can differ. */
export function PinnedHeader({
  ticker,
  setTicker,
}: {
  ticker: string;
  setTicker: (ticker: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="chip font-mono">
        <Target className="h-2.5 w-2.5" />
        {ticker}
      </span>
      <button
        type="button"
        onClick={() => setTicker(null)}
        className="text-[11px] text-brand-muted-fg transition-colors hover:text-brand-fg hover:underline"
      >
        Change
      </button>
    </div>
  );
}
