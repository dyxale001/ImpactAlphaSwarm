import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Flame, MessageCircleQuestion, RefreshCw } from "lucide-react";
import { useSignals } from "../../../dashboard/DashboardDataContext";
import { useAskChatbotStore } from "../../../store/askChatbotStore";
import type { AssetRecommendation } from "../../../hooks/useDashboardStats";
import { useAnalysisRefresh } from "../../../hooks/useAnalysisRefresh";
import { CONVERGENCE_DETAIL, type ConvergenceState } from "../../../data/signalCopy";
import { describeRunAge, isRunStale } from "../../../utils/staleness";
import AddToWatchlistButton from "../Addtowatchlistbutton";
import { ScoredSignals, UniverseLine, ordinal, scoredReadings } from "../scoredStock";
import { WidgetEmpty, WidgetHeaderLink, WidgetLoading } from "./widgetChrome";

// Widgets over the latest AI run. All three read the one shared feed from
// DashboardDataContext rather than fetching their own, so a dashboard carrying
// every signal widget still costs a single set of queries.

/** Assets that got an LLM-written trace, and so are shown as full cards. Mirrors
 *  SHORTLIST_SIZE on the assets page and REASONING_TRACE_TOP_N on the backend. */
const SHORTLIST_SIZE = 5;

function NoRunYet() {
  return (
    <WidgetEmpty
      message="No completed analysis run yet. Once one finishes, the stocks it ranked show up here."
      action={
        <Link
          to="/assets"
          className="text-xs font-bold text-forest-700 hover:underline"
        >
          Go to stocks
        </Link>
      }
    />
  );
}

/** The ticker tile the Stocks page and the redesign's lists lead a row with. */
function TickerTile({ ticker, small = false }: { ticker: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-forest-700 px-1.5 text-xs font-bold tracking-[0.02em] text-white ${
        small ? "h-8 min-w-8 rounded-[10px]" : "h-9 min-w-9 rounded-[11px]"
      }`}
    >
      {ticker.slice(0, 4)}
    </span>
  );
}

/** One reading as a labelled bar: the label, its figure, and how far along. */
function Meter({ label, value, percent }: { label: string; value: string; percent: number | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-brand-muted-fg">{label}</span>
        <b className="text-sm tabular-nums text-forest-900">{value}</b>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-forest-900/8">
        <i
          className="block h-full rounded-full bg-forest-700"
          style={{ width: `${Math.max(0, Math.min(100, percent ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

// The agreement state in a word or three, for a row with room for one chip.
const AGREEMENT_SHORT: Record<ConvergenceState, string> = {
  agree_strongly: "Agree strongly",
  lean_together: "Lean the same way",
  mixed: "Partly agree",
  conflict: "Conflict",
};

function AgreementChip({ asset }: { asset: AssetRecommendation }) {
  if (asset.isHype) {
    return (
      <span className="chip chip-caution shrink-0">
        <Flame className="h-3 w-3" aria-hidden="true" /> Hype
      </span>
    );
  }
  if (!asset.convergenceState) return null;
  const tone =
    asset.convergenceState === "agree_strongly"
      ? "chip-up"
      : asset.convergenceState === "conflict"
        ? "chip-caution"
        : "";
  return <span className={`chip shrink-0 ${tone}`}>{AGREEMENT_SHORT[asset.convergenceState]}</span>;
}

/**
 * The whole shortlist as one card: the run's leader in an inset, with its two
 * readings and why it ranks there, and ranks two to five beside it as a divided
 * list. Side by side once the widget is wide enough; stacked below that.
 *
 * The ranking is one thought, so it is one widget, and the loading and empty
 * states are stated once instead of twice over the same feed.
 */
export function ShortlistWidget() {
  const { topPick, filteredRecs, recommendations, isLoadingRecs, isRunInProgress } = useSignals();
  const openAskChatbot = useAskChatbotStore((s) => s.openWithPrompt);

  // Rank one leads, so the list starts at two. Falling back to the top pick's
  // own rank keeps that true even if a run's ranking is not 1-based.
  const heroRank = topPick?.rank ?? 1;
  const runnersUp = filteredRecs.filter((r) => r.rank > heroRank && r.rank <= SHORTLIST_SIZE);

  if (isLoadingRecs) return <WidgetLoading rows={4} />;
  if (isRunInProgress) {
    return (
      <WidgetEmpty dark message="An analysis run is in progress. Your shortlist appears here as soon as it lands." />
    );
  }
  if (!topPick) return <NoRunYet />;

  const { percentile, verdict } = scoredReadings(topPick);
  const reasoning =
    topPick.reasoning ||
    (topPick.convergenceState
      ? CONVERGENCE_DETAIL[topPick.convergenceState]
      : "No reasoning trace available for this run.");

  return (
    <div className="@container">
      <WidgetHeaderLink to="/assets">All {recommendations.length} stocks</WidgetHeaderLink>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="as-inset flex flex-col gap-3.5 p-4">
          <Link
            to={`/asset/${topPick.ticker}`}
            className="group flex items-center justify-between gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
          >
            <span className="flex min-w-0 items-center gap-3">
              <TickerTile ticker={topPick.ticker} />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-forest-900 group-hover:underline">{topPick.ticker}</span>
                <span className="block truncate text-xs text-brand-muted-fg" title={topPick.name}>
                  {topPick.name}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-xl font-bold tabular-nums tracking-[-0.01em] text-forest-900">
              R {topPick.currentPrice.toFixed(2)}
            </span>
          </Link>

          <UniverseLine asset={topPick} />

          <div className="-mt-1 flex flex-wrap items-center gap-1.5">
            <span className="chip chip-dark">1st for your profile</span>
            <ScoredSignals asset={topPick} />
          </div>

          <div className="grid gap-3 @md:grid-cols-2">
            <Meter label="Sentiment" value={`${topPick.sentimentScore} · ${verdict.label}`} percent={topPick.sentimentScore} />
            <Meter
              label="Quant vs peers"
              value={percentile !== null ? `${ordinal(percentile)} percentile` : "No percentile"}
              percent={percentile}
            />
          </div>

          <p className="line-clamp-3 text-sm leading-relaxed text-forest-900">{reasoning}</p>

          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              to={`/asset/${topPick.ticker}`}
              className="inline-flex items-center gap-1 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
            >
              Full analysis <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => openAskChatbot(`Tell me about ${topPick.ticker}`)}
              aria-label={`Ask AlphaSwarm about ${topPick.ticker}`}
              className="as-btn as-btn-sm as-btn-secondary"
            >
              <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" />
              Ask about this
            </button>
          </div>
        </div>

        {runnersUp.length > 0 ? (
          <ol aria-label="Ranks two to five" className="divide-y divide-forest-900/8">
            {runnersUp.map((asset) => (
              <li key={asset.assetId}>
                <Link
                  to={`/asset/${asset.ticker}`}
                  className="group flex items-center gap-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-brand-muted-fg">
                    {asset.rank}
                  </span>
                  <TickerTile ticker={asset.ticker} small />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="text-sm font-bold text-forest-900 group-hover:underline">{asset.ticker}</span>
                      <span className="hidden truncate text-xs text-brand-muted-fg @sm:inline" title={asset.name}>
                        {asset.name}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-brand-muted-fg">
                      {asset.universe ? `${asset.universe} · ` : ""}R {asset.currentPrice.toFixed(2)}
                    </span>
                  </span>
                  <AgreementChip asset={asset} />
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/** Everything the run scored below the shortlist, as the Stocks page lists it. */
export function AlsoScoredWidget() {
  const { filteredRecs, isLoadingRecs } = useSignals();
  const [showAll, setShowAll] = useState(false);

  const alsoScored = filteredRecs.filter((r) => r.rank > SHORTLIST_SIZE);
  const INITIAL_ROWS = 8;
  const visible = showAll ? alsoScored : alsoScored.slice(0, INITIAL_ROWS);

  if (isLoadingRecs) return <WidgetLoading rows={3} />;
  if (alsoScored.length === 0) {
    return (
      <WidgetEmpty message="This run did not score anything beyond its shortlist." />
    );
  }

  return (
    <div className="@container space-y-3">
      <WidgetHeaderLink to="/assets">All stocks</WidgetHeaderLink>
      {/* The Stocks page's phone rows, two to a line once the widget is wide. */}
      <ul className="grid @3xl:grid-cols-2 @3xl:gap-x-8">
        {visible.map((asset, i) => {
          const { percentile, verdict, verdictTone } = scoredReadings(asset);
          return (
            <li
              key={asset.assetId}
              className={`flex gap-3 py-3 ${i > 0 ? "border-t border-forest-900/8" : ""} ${
                i === 1 ? "@3xl:border-t-0" : ""
              }`}
            >
              <span className="w-5 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-brand-muted-fg">
                {asset.rank}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <Link
                  to={`/asset/${asset.ticker}`}
                  className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="text-sm font-bold text-forest-900 group-hover:underline">{asset.ticker}</span>
                      <span className="truncate text-xs text-brand-muted-fg" title={asset.name}>
                        {asset.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-forest-900">
                      R {asset.currentPrice.toFixed(2)}
                    </span>
                  </span>
                  <UniverseLine asset={asset} />
                </Link>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <span className={`chip ${verdictTone}`}>
                    <span className="tabular-nums">{asset.sentimentScore}</span>
                    {verdict.label}
                  </span>
                  <span className="tabular-nums text-brand-muted-fg">
                    {percentile !== null ? `${ordinal(percentile)} percentile vs peers` : "No quant percentile"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <ScoredSignals asset={asset} />
                  </span>
                  <span className="shrink-0">
                    <AddToWatchlistButton ticker={asset.ticker} />
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {alsoScored.length > INITIAL_ROWS ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="as-btn as-btn-secondary w-full">
          {showAll ? "Show less" : `Show all ${alsoScored.length} scored stocks`}
        </button>
      ) : null}
    </div>
  );
}

/** How old the numbers on this dashboard are, and a way to make them newer. */
export function RunStatusWidget() {
  const {
    latestRunCreatedAt,
    recommendations,
    isRunInProgress,
    refreshRecommendations,
  } = useSignals();
  const { refresh, isRunning } = useAnalysisRefresh();
  const stale = isRunStale(latestRunCreatedAt);

  // useAnalysisRefresh refetches the profile, but profile.id is what
  // useDashboardStats keys on and that does not change across a run. Re-read the
  // feed explicitly, the same way the assets page does after its own refresh.
  const runAnalysis = async () => {
    await refresh();
    await refreshRecommendations();
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="as-inset p-4">
        <p className="text-xs text-brand-muted-fg">Last analysis</p>
        <p className="mt-1 text-xl font-bold tracking-[-0.01em] text-forest-900">
          {latestRunCreatedAt ? describeRunAge(latestRunCreatedAt) : "Never run"}
        </p>
        {latestRunCreatedAt ? (
          <p className="mt-0.5 text-xs tabular-nums text-brand-muted-fg">
            {new Date(latestRunCreatedAt).toLocaleString()}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="chip">{recommendations.length} scored</span>
          {stale ? (
            <span className="chip chip-caution">Out of date</span>
          ) : latestRunCreatedAt ? (
            <span className="chip chip-up">Current</span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void runAnalysis()}
        disabled={isRunning || isRunInProgress}
        className="as-btn as-btn-sm as-btn-primary mt-auto w-full"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isRunning || isRunInProgress ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {isRunning || isRunInProgress ? "Running" : "Run analysis"}
      </button>
    </div>
  );
}
