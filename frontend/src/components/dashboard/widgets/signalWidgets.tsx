import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Sparkles } from "lucide-react";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { useSignals } from "../../../dashboard/DashboardDataContext";
import { SCORECARD_ENABLED } from "../../../hooks/useDashboardStats";
import { useAnalysisRefresh } from "../../../hooks/useAnalysisRefresh";
import { CONVERGENCE_DETAIL } from "../../../data/signalCopy";
import { discoveryProvenance } from "../../../utils/discovery";
import { describeRunAge, isRunStale } from "../../../utils/staleness";
import ConfidenceRing from "../ConfidenceRing";
import DualBar from "../DualBar";
import RecommendationCard from "../RecommendationCard";
import ScoredAssetRow from "../ScoredAssetRow";
import SignalScorecard from "../SignalScorecard";
import { WidgetEmpty, WidgetLoading } from "./widgetChrome";

// Widgets over the latest AI run. All four read the one shared feed from
// DashboardDataContext rather than fetching their own, so a dashboard carrying
// every signal widget still costs a single set of queries.

/** Assets that got an LLM-written trace, and so are shown as full cards. Mirrors
 *  SHORTLIST_SIZE on the assets page and REASONING_TRACE_TOP_N on the backend. */
const SHORTLIST_SIZE = 5;

function NoRunYet() {
  return (
    <WidgetEmpty
      message="No completed analysis run yet. Once one finishes, the assets it ranked show up here."
      action={
        <Link
          to="/assets"
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Go to assets
        </Link>
      }
    />
  );
}

/** The single strongest name in the run, on the dark forest hero surface. */
export function TopPickWidget({ size }: WidgetProps) {
  const { topPick, isLoadingRecs, isRunInProgress } = useSignals();

  if (isLoadingRecs) return <WidgetLoading rows={4} />;
  if (isRunInProgress) {
    return (
      <WidgetEmpty message="An analysis run is in progress. Your top pick appears here as soon as it lands." />
    );
  }
  if (!topPick) return <NoRunYet />;

  const showScorecard = SCORECARD_ENABLED && topPick.hasSignalTerms;
  const quantPercentile =
    topPick.quantLean != null ? ((topPick.quantLean + 1) / 2) * 100 : null;
  const reasoning =
    topPick.reasoning ||
    (topPick.convergenceState
      ? CONVERGENCE_DETAIL[topPick.convergenceState]
      : "No reasoning trace available for this run.");

  // Side by side only once there is genuine room for it. At medium the widget is
  // half the grid, where two columns would squeeze the scorecard's explainers
  // into a column too narrow to read.
  const stacked = size !== "wide";

  return (
    <div className="hero-card overflow-hidden p-5">
      <Link
        to={`/asset/${topPick.ticker}`}
        className="flex w-fit items-center gap-2 mb-4 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
      >
        <Sparkles className="h-4 w-4 text-brand-accent" />
        <span className="text-xs font-semibold uppercase text-brand-accent">
          {showScorecard ? "Highest signal for your profile" : "Top pick today"}
        </span>
      </Link>

      <div className={`flex gap-5 ${stacked ? "flex-col" : "flex-col md:flex-row"}`}>
        {/* Not wrapped in the asset link: the scorecard carries its own explainer
            buttons, and a button inside an anchor is invalid markup. */}
        {showScorecard ? (
          <div
            className={`shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4 ${
              stacked ? "w-full" : "w-full md:w-64"
            }`}
          >
            <SignalScorecard
              onDark
              terms={{
                signalStrength: topPick.signalStrength,
                signalDirection: topPick.signalDirection,
                convergence: topPick.convergence,
                convergenceState: topPick.convergenceState,
                dataSufficiency: topPick.dataSufficiency,
                profileFit: topPick.profileFit,
                quantState: topPick.quantState,
              }}
            />
          </div>
        ) : (
          <Link
            to={`/asset/${topPick.ticker}`}
            className="self-start rounded-2xl border border-white/10 bg-white/5 p-4 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            <ConfidenceRing
              score={topPick.confidenceScore}
              label="Confidence Score"
              onDark
            />
          </Link>
        )}

        <div className="w-full min-w-0 flex-1 space-y-3">
          <Link
            to={`/asset/${topPick.ticker}`}
            className="block w-fit transition-opacity hover:opacity-80"
          >
            <h2 className="font-mono text-2xl font-bold text-brand-bg">
              {topPick.ticker}
            </h2>
            <span className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-brand-bg">
              {topPick.name}
            </span>
            <div className="mt-3 font-mono text-xl text-brand-bg">
              R {topPick.currentPrice.toFixed(2)}
            </div>
          </Link>

          {topPick.isDiscovered ? (
            <span
              className="chip w-fit bg-brand-accent text-brand-fg"
              title={discoveryProvenance(topPick.discoverySources)}
            >
              <Sparkles className="h-2.5 w-2.5" /> Discovered via trending
            </span>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <DualBar
              sentimentScore={topPick.sentimentScore}
              quantitativeScore={topPick.fundamentalsScore}
              quantPercentile={quantPercentile}
              onDark
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand-accent">
              Why it ranks here
            </p>
            <p className="text-xs leading-relaxed text-brand-bg/80">{reasoning}</p>
          </div>

          <Link
            to={`/asset/${topPick.ticker}`}
            className="inline-block text-xs font-semibold text-brand-accent hover:underline"
          >
            Full analysis →
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Ranks two to five: the rest of the shortlist, as cards. */
export function RankedFeedWidget({ size }: WidgetProps) {
  const { filteredRecs, isLoadingRecs } = useSignals();
  const shortlisted = filteredRecs.filter((r) => r.rank <= SHORTLIST_SIZE);

  if (isLoadingRecs) return <WidgetLoading rows={2} />;
  if (shortlisted.length === 0) return <NoRunYet />;

  // The widget already occupies a share of the six-column page grid, so its own
  // columns are set by how wide it is rather than by the viewport alone.
  const columns =
    size === "wide"
      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
      : "grid-cols-1";

  return (
    <div className={`grid gap-4 ${columns}`}>
      {shortlisted.map((asset, i) => (
        <RecommendationCard
          key={asset.assetId}
          asset={asset}
          sizeClass=""
          delay={i}
        />
      ))}
    </div>
  );
}

/** Everything the run scored below the shortlist. Same data, lighter treatment. */
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
    <div className="space-y-3">
      <ul className="soft-card divide-y divide-brand-border/40 overflow-hidden p-0">
        {visible.map((asset) => (
          <ScoredAssetRow key={asset.assetId} asset={asset} />
        ))}
      </ul>
      {alsoScored.length > INITIAL_ROWS ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-2.5 text-xs font-semibold text-brand-muted-fg transition-colors hover:border-brand-primary/40 hover:text-brand-fg"
        >
          {showAll
            ? "Show less"
            : `Show all ${alsoScored.length} scored assets`}
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
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
          Last analysis
        </p>
        <p className="mt-1 text-sm font-semibold text-brand-fg">
          {latestRunCreatedAt
            ? describeRunAge(latestRunCreatedAt)
            : "Never run"}
        </p>
        {latestRunCreatedAt ? (
          <p className="mt-0.5 text-[11px] text-brand-muted-fg">
            {new Date(latestRunCreatedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="chip bg-brand-border/30 text-brand-muted-fg">
          {recommendations.length} scored
        </span>
        {stale ? (
          <span className="chip bg-semantic-warning/15 text-semantic-warning">
            Out of date
          </span>
        ) : latestRunCreatedAt ? (
          <span className="chip bg-brand-primary/10 text-brand-primary">
            Current
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => void runAnalysis()}
        disabled={isRunning || isRunInProgress}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-accent px-4 py-2 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isRunning || isRunInProgress ? "animate-spin" : ""}`}
        />
        {isRunning || isRunInProgress ? "Running" : "Run analysis"}
      </button>
    </div>
  );
}
