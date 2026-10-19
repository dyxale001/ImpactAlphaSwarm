import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRight, Target } from "lucide-react";
import { useSignals } from "../../../dashboard/DashboardDataContext";

// Small pieces every widget shares, so an empty whale panel and an empty news
// panel read as the same product rather than as two people's work.

/**
 * The two places in a widget's frame header the widget itself fills: before the
 * subtitle (the stock picker) and top right (the link to the full page). Null
 * while the frame is in edit mode, where the header is the move and size bar.
 * Outside a frame (a widget rendered on its own, as in tests) there is no
 * provider and the pieces render where they are written.
 */
export const WidgetSlots = createContext<{ subtitle: HTMLElement | null; action: HTMLElement | null } | undefined>(
  undefined,
);

function useSlot(which: "subtitle" | "action") {
  const slots = useContext(WidgetSlots);
  return slots === undefined ? undefined : slots[which];
}

/** Puts children into the frame's header slot, or in place when there is no frame. */
function InSlot({ which, children }: { which: "subtitle" | "action"; children: ReactNode }) {
  const slot = useSlot(which);
  if (slot === undefined) return <>{children}</>;
  return slot ? createPortal(children, slot) : null;
}

/** A control in front of the header's subtitle, such as a widget's sector. */
export function WidgetSubtitle({ children }: { children: ReactNode }) {
  return <InSlot which="subtitle">{children}</InSlot>;
}

/** The widget's way to the full page, shown top right in its header. */
export function WidgetHeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <InSlot which="action">
      <Link
        to={to}
        className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
      >
        {children}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </InSlot>
  );
}

export function WidgetEmpty({
  message,
  action,
  grow = false,
  dark = false,
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
  /** Slightly stronger border/text contrast, for a box that otherwise reads
   *  too faint against its surroundings. Opt-in so every other empty state
   *  keeps its normal, lighter weight. */
  dark?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed px-4 py-8 text-center ${
        dark ? "border-forest-900/25 bg-forest-50" : "border-forest-900/15"
      } ${grow ? "flex-1" : ""}`}
    >
      <p className={`text-xs leading-relaxed max-w-xs ${dark ? "text-forest-900/80" : "text-brand-muted-fg"}`}>
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
        <div key={i} className="h-12 rounded-[12px] bg-forest-50 animate-pulse" />
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-forest-900/15 px-4 py-7 text-center">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-forest-50 text-forest-700">
        <Target className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="text-xs text-brand-muted-fg leading-relaxed max-w-xs">
        Choose a stock to see {what} for it. This sets the stock for this
        widget only, so the rest of your dashboard stays where it is.
      </p>

      {isLoadingRecs ? (
        <p className="text-xs text-brand-muted-fg">Loading the latest run…</p>
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
                className="chip chip-line cursor-pointer font-mono transition-colors hover:border-forest-700 hover:bg-forest-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
              >
                {asset.ticker}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-brand-muted-fg">
          {isRunInProgress
            ? "An analysis run is in progress. The stocks it scores appear here as soon as it lands."
            : "No completed analysis run yet. Once one finishes, everything it scores can be chosen here."}
        </p>
      )}
    </div>
  );
}

/** This widget's chosen ticker, as a small select in front of the header's
 *  subtitle, so the reader always knows which stock THIS card is showing (two
 *  can differ) and can move it to another of the run's stocks in one step. */
export function PinnedHeader({
  ticker,
  setTicker,
}: {
  ticker: string;
  setTicker: (ticker: string | null) => void;
}) {
  const { recommendations } = useSignals();
  const tickers = recommendations.map((r) => r.ticker);
  // A stock chosen from an older run stays selectable until it is changed.
  if (!tickers.includes(ticker)) tickers.unshift(ticker);
  return (
    <InSlot which="subtitle">
      <select
        aria-label="Stock for this widget"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        className="as-select as-select-sm font-mono"
      >
        {tickers.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </InSlot>
  );
}
