import AboutThisPage from "../components/guidance/AboutThisPage";
import type {
  AnalysisLoadingStage,
  AnalysisProgress,
} from "../types/analysisLifecycle";
import { getAnalysisExecutionIdentity } from "../types/analysisLifecycle";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Sparkles,
  ArrowRight,
  RefreshCw,
  CandlestickChart,
  ChevronDown,
  CircleAlert,
  Flame,
  MessageCircleQuestion,
} from "lucide-react";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useAuthStore } from "../store/authStore";
import { type AssetRecommendation } from "../hooks/useDashboardStats";
import { supabase } from "../lib/supabase";

import ConfidenceRing from "../components/dashboard/ConfidenceRing";
import DualBar from "../components/dashboard/DualBar";
import RecommendationCard from "../components/dashboard/RecommendationCard";
import SignalScorecard from "../components/dashboard/SignalScorecard";
import { SCORECARD_ENABLED } from "../hooks/useDashboardStats";
import { CONVERGENCE_DETAIL, CONVERGENCE_HEADLINE } from "../data/signalCopy";
import { discoveryProvenance } from "../utils/discovery";
import AssetsAnalysisLoading from "../components/dashboard/AssetsAnalysisLoading";
import DashboardSkeleton from "../components/dashboard/DashboardSkeleton";
import { sentimentVerdict } from "../components/research/sentimentDisplay";
import { sectorColour } from "../utils/sectorColours";

import {
  startAnalysis,
  getStatus,
  getResult,
  getUsdZarExchangeRate,
} from "../services/api/analysis";
import { pollUntilComplete } from "../services/api/poll";
import { useAnalysisRefresh } from "../hooks/useAnalysisRefresh";
import { rememberHubPage } from "../utils/lastHubPage";
import { useStaleAutoRefresh } from "../hooks/useStaleAutoRefresh";
import { isRunStale } from "../utils/staleness";
import StaleDataBanner from "../components/dashboard/StaleDataBanner";
import { MarketClock } from "../components/research/MarketClock";
import { useSentimentLastUpdated } from "../hooks/useSentimentLastUpdated";
import { useAskChatbotStore } from "../store/askChatbotStore";
import AddToWatchlistButton from "../components/dashboard/Addtowatchlistbutton";
import { ListingLine } from "../components/research/ListingLine";

/** Assets that got an LLM-written trace, and so are shown as full cards. Mirrors
 *  REASONING_TRACE_TOP_N on the backend; everything below this rank carries the
 *  deterministic trace instead and is shown as a row. */
const SHORTLIST_SIZE = 5;
/** Rows shown before the "Show all" toggle, matching the house pattern in
 *  FundHoldingsView. */
const INITIAL_ROWS = 12;

/** 84 -> "84th", 1 -> "1st", 12 -> "12th". */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export default function AssetsPage() {
  // Names this as the page an asset's "Back to X" link should return to. See
  // lastHubPage.ts: every route into /asset/:ticker shares this without being
  // threaded through individually.
  useEffect(() => {
    rememberHubPage("/assets");
  }, []);

  const {
    search,
    setSearch,
    topPick,
    filteredRecs,
    isLoadingRecs,
    isRunInProgress,
    isRunComplete,
    analysisProgress,
    recommendationError,
    latestRunCreatedAt,
    recommendations,
    refreshRecommendations,
    // Read the whole ranked feed, as the Dashboard data provider also does.
    // This page separates the top five into cards and the remaining assets into rows.
  } = useDashboardStats({ limit: null });

  // Ranks 2 to 5: shortlisted, shown as cards alongside the hero at rank 1.
  const shortlisted = filteredRecs.filter((r) => r.rank <= SHORTLIST_SIZE);
  // Everything else the run scored. Same data, lighter treatment.
  const alsoScored = filteredRecs.filter((r) => r.rank > SHORTLIST_SIZE);

  // The "Also scored" table filters by investment universe. Tabs list only the
  // universes this run actually scored, in the order they first appear.
  const [scoredUniverse, setScoredUniverse] = useState<string>("All");
  const scoredUniverses = Array.from(
    new Set(alsoScored.map((r) => r.universe).filter((u): u is string => Boolean(u))),
  );
  const filteredScored =
    scoredUniverse === "All"
      ? alsoScored
      : alsoScored.filter((r) => r.universe === scoredUniverse);

  const [showAllScored, setShowAllScored] = useState(false);
  const visibleScored = showAllScored
    ? filteredScored
    : filteredScored.slice(0, INITIAL_ROWS);

  // Temporary toggle to hide header controls during this iteration
  const hideHeaderControls = true;

  // The top pick's preview tabs were removed alongside the cards': they restated
  // numbers already shown, and the "Hype Risk Assessment" tab described the
  // penalty that convergence replaced. The reasoning trace is what remains.
  const openAskChatbot = useAskChatbotStore((s) => s.openWithPrompt);

  const topPickReasoning =
    topPick?.reasoning ||
    (topPick?.convergenceState
      ? CONVERGENCE_DETAIL[topPick.convergenceState]
      : "No reasoning trace available for this run.");

  const showTopPickScorecard = Boolean(
    SCORECARD_ENABLED && topPick?.hasSignalTerms,
  );
  const topPickQuantPercentile =
    topPick?.quantLean != null ? ((topPick.quantLean + 1) / 2) * 100 : null;

  const { profile, analysis, isLoading, isProfileLoading, fetchProfile } =
    useAuthStore();
  const navigate = useNavigate();

  const [manualStage, setManualStage] = useState<AnalysisLoadingStage | null>(
    null,
  );
  const [manualProgress, setManualProgress] = useState<AnalysisProgress | null>(
    null,
  );
  const isRunning = manualStage !== null;
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [exchangeRateSource, setExchangeRateSource] =
    useState<string>("Yahoo Finance");

  const loadExchangeRate = useCallback(async () => {
    try {
      const rateData = await getUsdZarExchangeRate();
      setExchangeRate(rateData.rate);
      setExchangeRateSource(rateData.source);
    } catch (error) {
      console.error("Failed to load USD/ZAR exchange rate:", error);
      setExchangeRate(null);
    }
  }, []);

  useEffect(() => {
    void loadExchangeRate();
  }, [loadExchangeRate]);

  // Both flags matter: `isRunning` covers the manual Refresh button, while the
  // hook's own flag covers a refresh IT started (the stale auto-refresh). Only the
  // button's state was being used, so an auto-refresh ran with no loading state at
  // all — the page looked blank while a multi-minute analysis went on — and the
  // auto-refresh guard could not see its own run.
  const {
    refresh,
    isRunning: isAutoRefreshRunning,
    stage: autoRefreshStage,
    progress: autoRefreshProgress,
    error: autoRefreshError,
    clearError: clearAutoRefreshError,
  } = useAnalysisRefresh(refreshRecommendations);
  const {
    updatedAt: sentimentUpdatedAt,
    isLoading: isSentimentUpdatedLoading,
  } = useSentimentLastUpdated();
  const anyRunInFlight = isRunning || isAutoRefreshRunning;
  const isStale = isRunStale(latestRunCreatedAt);

  const handleRefresh = async () => {
    if (!profile?.id || anyRunInFlight) return;

    setRefreshError(null);
    clearAutoRefreshError();
    setManualStage("preparing");
    setManualProgress(null);
    let manualRunStarted = false;
    let manualRunFinished = false;
    let currentManualExecutionIdentity: string | null = null;
    try {
      const universes = Array.isArray(analysis?.investment_universe)
        ? analysis.investment_universe
        : [];

      // Fetch user's actual watchlist tickers to merge into this run
      const { data: wlRows } = await supabase
        .from("user_watchlist_assets")
        .select("ticker, assets(ticker)")
        .eq("user_id", profile.id);
      const watchlistTickers = (wlRows || [])
        .map((r: any) => r.ticker || r.assets?.ticker)
        .filter(Boolean) as string[];

      const { run_id } = await startAnalysis({
        universes,
        watchlist: watchlistTickers,
        risk_tolerance: analysis?.risk_tolerance ?? "Moderate",
        expertise_level: analysis?.ai_derived_expertise ?? "novice",
      });

      manualRunStarted = true;
      setManualStage("processing");
      await refreshRecommendations();

      await pollUntilComplete(run_id, getStatus, getResult, (status) => {
        if (status.id !== run_id) return;
        const executionIdentity = getAnalysisExecutionIdentity(
          status.id,
          status.created_at,
        );
        if (
          currentManualExecutionIdentity &&
          executionIdentity !== currentManualExecutionIdentity
        )
          return;
        currentManualExecutionIdentity = executionIdentity;
        setManualProgress(status.progress);
        if (status.status === "complete") {
          manualRunFinished = true;
          setManualStage("results");
        }
        if (status.status === "failed") {
          manualRunFinished = true;
          setManualStage(null);
        }
      });
      manualRunFinished = true;
      await fetchProfile(profile.id);
      await refreshRecommendations();
      await loadExchangeRate();
    } catch (e) {
      console.error("Refresh analysis failed:", e);
      setRefreshError(
        "We couldn’t finish checking your analysis. It may still be running. Try checking again.",
      );
    } finally {
      if (manualRunFinished || !manualRunStarted) {
        setManualStage(null);
        setManualProgress(null);
      }
    }
  };

  const currentlyLoading =
    isProfileLoading !== undefined ? isProfileLoading : isLoading;

  useEffect(() => {
    if (!currentlyLoading && profile?.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [profile, currentlyLoading, navigate]);

  // Self-heal returning users whose data predates the last nightly run.
  useStaleAutoRefresh({
    isStale,
    isRunning: anyRunInFlight || isRunInProgress,
    ready:
      !currentlyLoading &&
      !isLoadingRecs &&
      !recommendationError &&
      Boolean(profile?.id),
    refresh,
  });

  if (currentlyLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-bg text-brand-fg">
        Loading workspace...
      </div>
    );
  }

  if (profile?.role === "admin") return null;

  const analysisError = refreshError || autoRefreshError || recommendationError;

  // A failed status/read must remain visible even if the last known status was running.
  if (!anyRunInFlight && analysisError) {
    return (
      <div className="max-w-7xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-10">
        <div
          className="soft-card mx-auto max-w-xl p-5 text-center sm:p-6"
          role="alert"
        >
          <div className="flex flex-col items-center gap-3">
            <CircleAlert
              className="h-5 w-5 shrink-0 text-forest-700"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-3">
              <div>
                <h1 className="text-xl font-semibold text-brand-fg">
                  We couldn't complete your analysis
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-brand-muted-fg">
                  Something interrupted the analysis before it could finish. You
                  can try again whenever you're ready.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="as-btn as-btn-primary mt-4"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Local lifecycle takes precedence over an older saved run during a new start.
  const loadingStage =
    manualStage ??
    autoRefreshStage ??
    (isRunInProgress
      ? "processing"
      : isRunComplete && isLoadingRecs
        ? "results"
        : null);
  const loadingProgress = anyRunInFlight
    ? (manualProgress ?? autoRefreshProgress)
    : analysisProgress;
  if (loadingStage) {
    return (
      <AssetsAnalysisLoading stage={loadingStage} progress={loadingProgress} />
    );
  }

  if (isLoadingRecs) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-10 max-w-7xl mx-auto">
      {/* Header band. Title and "About this page" on top; one status row along
          the foot: the market and FX footing every price relies on, on the left,
          and the run's freshness with its Refresh button on the right. */}
      <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="band-eyebrow mb-2">
              Personalised Asset Analysis
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em] text-brand-bg flex items-center gap-3">
              <CandlestickChart className="w-7 h-7 shrink-0 text-brand-accent" />
              Stocks
            </h1>
            <p className="text-sm text-brand-bg/75 mt-2 max-w-2xl leading-relaxed">
              Every US stock your AI Investment Committee ranked in the latest run.
              {recommendations.length > 0 ? (
                <span className="font-medium text-brand-bg">
                  {" "}
                  {recommendations.length} stocks scored.
                </span>
              ) : null}
            </p>
          </div>
          <AboutThisPage page="stocks"
            rankingMode={SCORECARD_ENABLED ? "scorecard" : "legacy"}
            methodologyHref={topPick ? `/asset/${encodeURIComponent(topPick.ticker)}/how-it-works` : undefined}
            learnContext="stocks"
            className="shrink-0 self-start"
          />
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-white/12 pt-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          {/* Market and FX footing for every price on the page. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-brand-bg/70">
            {exchangeRate !== null ? (
              <>
                US Stock Exchanges • FX (USD/ZAR) from {exchangeRateSource}:{" "}
                <span className="font-semibold text-brand-bg">
                  1 USD = R{exchangeRate.toFixed(2)}
                </span>
              </>
            ) : (
              <span className="animate-pulse">
                US Stock Exchanges • Fetching USD/ZAR rate...
              </span>
            )}
            <span className="text-brand-bg/30" aria-hidden="true">
              •
            </span>
            <MarketClock tone="dark" bare />
          </div>

          {/* The run's freshness beside the button that renews it. Two dates,
              because a run can be hours old while the sentiment behind it was
              topped up an hour ago. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5 lg:shrink-0">
            <div className="grid grid-cols-[auto_minmax(0,auto)] gap-y-0.5 text-xs leading-tight text-brand-bg/60">
              <span className="border-r border-brand-bg/15 pr-2 mr-2">
                Last AI run
              </span>
              <span className="font-semibold text-brand-bg">
                {latestRunCreatedAt
                  ? new Date(latestRunCreatedAt).toLocaleString()
                  : "—"}
              </span>
              <span className="border-r border-brand-bg/15 pr-2 mr-2">
                Sentiment updated
              </span>
              <span className="font-semibold text-brand-bg">
                {sentimentUpdatedAt
                  ? new Date(sentimentUpdatedAt).toLocaleString()
                  : isSentimentUpdatedLoading
                    ? "…"
                    : "—"}
              </span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRunning}
              className="as-btn as-btn-sm as-btn-lime w-full sm:w-auto disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {isRunning ? "Running..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div
        className={
          hideHeaderControls ? "hidden" : "flex items-center gap-2 flex-wrap"
        }
      >
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stocks..."
            className="w-full h-10 bg-white border border-forest-900/14 rounded-full pl-10 pr-4 text-sm text-brand-fg focus:border-forest-700 focus:ring-[3px] focus:ring-lime-700/45 focus:outline-none transition"
          />
        </div>
      </div>
      {/* Staleness notice for returning users (auto-refresh runs alongside it) */}
      {isStale && latestRunCreatedAt && (
        <StaleDataBanner
          latestRunCreatedAt={latestRunCreatedAt}
          isRefreshing={isRunning}
        />
      )}

      {/* Top Pick — dark hero surface (hero-card), same family as the
          WhaleWatching and Watchlist headers. z-10 lifts its hover tooltips
          over the shortlist cards below; it was z-50, which tied with the
          phone top bar and, coming later in the page, scrolled over it and
          hid the logo and menu button. */}
      <div className="hero-card z-10 overflow-visible rounded-[20px] p-5 sm:p-6">
        <Link
          to={`/asset/${topPick?.ticker}`}
          className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity w-fit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          <Sparkles className="w-4 h-4 text-brand-accent" />
          <span className="text-xs text-brand-accent font-semibold">
            {showTopPickScorecard
              ? "Highest signal for your profile"
              : "Top Pick Today"}
          </span>
        </Link>
        {/* Ticker, price, meters and reasoning take three quarters of the card;
            the scorecard sits on the right in the last quarter. */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          <div className="space-y-3 w-full min-w-0">
            <Link
              to={`/asset/${topPick?.ticker}`}
              className="flex items-start gap-3 hover:opacity-80 transition-opacity w-fit"
            >
              <div>
                <h2 className="text-2xl font-bold tabular-nums text-brand-bg">
                  {topPick?.ticker}
                </h2>
                <span className="inline-block mt-2 px-3 py-1 bg-white/10 rounded-full text-xs tabular-nums text-brand-bg">
                  {topPick?.name}
                </span>
                <div className="text-xl tabular-nums text-brand-bg mt-3">
                  R{" "}
                  <span className="tabular-nums">
                    {topPick?.currentPrice?.toFixed(2)}
                  </span>
                </div>
              </div>
            </Link>
            <ListingLine universe={topPick?.universe} exchange={topPick?.exchange} onDark />
            {topPick?.isDiscovered ? (
              <span
                className="chip w-fit bg-lime-500 text-forest-900"
                title={discoveryProvenance(topPick?.discoverySources)}
              >
                <Sparkles className="w-2.5 h-2.5" /> Discovered via trending
              </span>
            ) : null}
            <div className="rounded-[14px] border border-white/12 bg-white/[0.06] p-3">
              <DualBar
                sentimentScore={topPick?.sentimentScore || 0}
                quantitativeScore={topPick?.fundamentalsScore || 0}
                quantPercentile={topPickQuantPercentile}
                onDark
              />
            </div>
            <div className="rounded-[14px] border border-white/12 bg-white/[0.06] p-3 w-full h-auto">
              <p className="text-xs text-brand-accent mb-2 font-bold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Why it ranks here
              </p>
              <p className="text-xs text-brand-bg/85 leading-relaxed w-full">
                {topPickReasoning}
              </p>
            </div>
          </div>
          {/* The scorecard is NOT wrapped in the asset Link: it contains its own
              explainer buttons, and nesting <button> inside <a> is invalid markup
              — it also made tapping an explainer navigate away instead of opening
              it. Only the plain ring stays clickable. */}
          {showTopPickScorecard ? (
            <div className="h-full w-full rounded-[14px] border border-white/12 bg-white/[0.06] p-4">
              <SignalScorecard
                onDark
                fill
                terms={{
                  signalStrength: topPick!.signalStrength,
                  signalDirection: topPick!.signalDirection,
                  convergence: topPick!.convergence,
                  convergenceState: topPick!.convergenceState,
                  dataSufficiency: topPick!.dataSufficiency,
                  profileFit: topPick!.profileFit,
                  quantState: topPick!.quantState,
                }}
              />
            </div>
          ) : (
            <Link
              to={`/asset/${topPick?.ticker}`}
              className="hover:opacity-80 transition-opacity relative z-50 rounded-[14px] border border-white/12 bg-white/[0.06] p-4 self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <ConfidenceRing
                score={topPick?.confidenceScore || 0}
                label="Confidence Score"
                onDark
              />
            </Link>
          )}
        </div>
        {/* Bottom row of the card: the link to the full analysis on the left,
            ask and watchlist on the bottom right. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-4">
          <Link
            to={`/asset/${topPick?.ticker}`}
            className="text-xs text-brand-accent hover:underline flex items-center gap-1 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            Full analysis <ArrowRight className="w-3 h-3" />
          </Link>
          {/* The same two controls every other ranked stock carries
              (RecommendationCard, ScoredAssetRow), so rank 1 is not the
              one stock you cannot ask about or watch from this page. The
              ask button takes a dark-ground variant of the card's
              styling; the watchlist chip is the shared component. */}
          {topPick?.ticker ? (
            <div className="flex items-center gap-1.5">
              <div className="relative group">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAskChatbot(`Tell me about ${topPick.ticker}`);
                  }}
                  aria-label={`Ask AlphaSwarm about ${topPick.ticker}`}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-brand-bg/70 hover:text-brand-accent hover:bg-white/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                >
                  <MessageCircleQuestion className="w-4 h-4" />
                </button>
                <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute right-0 mt-2 w-max max-w-[calc(100vw-2rem)] z-50">
                  <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border whitespace-nowrap">
                    Ask AlphaSwarm about this
                  </div>
                </div>
              </div>
              <AddToWatchlistButton ticker={topPick.ticker} onDark />
            </div>
          ) : null}
        </div>
      </div>

      {/* The rest of the shortlist, ranks 2 to 5. Headed by the block above,
          alongside the hero it continues. */}
      <div>
        {filteredRecs.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-primary">
            No analysis results available right now.
          </div>
        ) : (
          <div className="bento-grid">
            {shortlisted.map((asset: AssetRecommendation, i: number) => {
              const cardSize = "col-span-6 md:col-span-3 lg:col-span-3";
              return (
                <RecommendationCard
                  key={asset.ticker}
                  asset={asset}
                  sizeClass={cardSize}
                  delay={i}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Everything else the run scored. Rendered only when there is something
          past the shortlist, so a run that stored only five (any run predating
          the whole-feed write) shows a coherent page rather than an empty
          heading. */}
      {alsoScored.length > 0 ? (
        <section className="mt-10" aria-labelledby="also-scored-heading">
          <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
            <h2
              id="also-scored-heading"
              className="text-xl font-bold tracking-[-0.01em] text-forest-900"
            >
              Also scored in this run
            </h2>
            <span className="text-xs text-brand-muted-fg">
              {alsoScored.length} more
            </span>
          </div>
          <p className="text-sm text-brand-muted-fg mb-4">
            Outside your shortlist, in the same order. Select a stock for its
            full analysis.
          </p>

          {scoredUniverses.length > 1 ? (
            <div
              className="as-tabs as-tabs-sm mb-4"
              role="tablist"
              aria-label="Filter by investment universe"
            >
              {["All", ...scoredUniverses].map((universe) => {
                const count =
                  universe === "All"
                    ? alsoScored.length
                    : alsoScored.filter((r) => r.universe === universe).length;
                return (
                  <button
                    key={universe}
                    type="button"
                    role="tab"
                    aria-selected={scoredUniverse === universe}
                    onClick={() => {
                      setScoredUniverse(universe);
                      setShowAllScored(false);
                    }}
                    className="as-tab"
                  >
                    {universe !== "All" ? (
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${sectorColour(universe).fill}`}
                      />
                    ) : null}
                    {universe}
                    <span className="as-tab-ct">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="as-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-forest-900/8 text-left text-xs font-semibold text-brand-muted-fg">
                    <th scope="col" className="w-12 px-4 py-3 text-right">#</th>
                    <th scope="col" className="px-4 py-3">Stock</th>
                    <th scope="col" className="px-4 py-3 text-right">Price</th>
                    <th scope="col" className="px-4 py-3">Sentiment</th>
                    <th scope="col" className="px-4 py-3 text-right">Quant vs peers</th>
                    <th scope="col" className="px-4 py-3">Signals</th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Watchlist</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleScored.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-brand-muted-fg">
                        No other {scoredUniverse} stocks in this run.
                      </td>
                    </tr>
                  ) : (
                    visibleScored.map((asset: AssetRecommendation) => {
                      // quant_lean is the mean peer percentile mapped to [-1,+1].
                      const percentile =
                        asset.quantLean !== null
                          ? Math.round(((asset.quantLean + 1) / 2) * 100)
                          : null;
                      const verdict = sentimentVerdict(asset.sentimentScore);
                      const verdictTone =
                        verdict.tone === "positive"
                          ? "chip-up"
                          : verdict.tone === "negative"
                            ? "chip-down"
                            : "";
                      return (
                        <tr
                          key={asset.ticker}
                          className="border-b border-forest-900/8 last:border-b-0 transition-colors hover:bg-forest-50"
                        >
                          <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-brand-muted-fg">
                            {asset.rank}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/asset/${asset.ticker}`}
                              className="group flex flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                            >
                              <span className="flex min-w-0 items-baseline gap-1.5">
                                <span className="font-bold text-forest-900 group-hover:underline">
                                  {asset.ticker}
                                </span>
                                <span
                                  className="max-w-[220px] truncate font-medium text-brand-muted-fg"
                                  title={asset.name}
                                >
                                  {asset.name}
                                </span>
                              </span>
                              {asset.universe ? (
                                <span className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs text-brand-muted-fg">
                                  <span
                                    aria-hidden="true"
                                    className={`h-2 w-2 rounded-full ${sectorColour(asset.universe).fill}`}
                                  />
                                  {asset.universe}
                                  {asset.exchange ? ` · ${asset.exchange}` : ""}
                                </span>
                              ) : null}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                            R {asset.currentPrice.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
                              <span className="font-semibold tabular-nums">
                                {asset.sentimentScore}
                              </span>
                              <span className={`chip ${verdictTone}`}>
                                {verdict.label}
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                            {percentile !== null ? `${ordinal(percentile)} percentile` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex flex-wrap items-center gap-1.5">
                              {asset.isHype ? (
                                <span className="chip chip-caution">
                                  <Flame className="h-3 w-3" /> Hype flagged
                                </span>
                              ) : asset.convergenceState ? (
                                <span
                                  className={`chip ${
                                    asset.convergenceState === "agree_strongly"
                                      ? "chip-up"
                                      : asset.convergenceState === "conflict"
                                        ? "chip-caution"
                                        : ""
                                  }`}
                                >
                                  {CONVERGENCE_HEADLINE[asset.convergenceState]}
                                </span>
                              ) : null}
                              {asset.isDiscovered ? (
                                <span
                                  className="chip chip-accent"
                                  title={discoveryProvenance(asset.discoverySources)}
                                >
                                  <Sparkles className="h-3 w-3" /> Discovered
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex justify-end">
                              <AddToWatchlistButton ticker={asset.ticker} />
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {filteredScored.length > INITIAL_ROWS && (
            <button
              type="button"
              onClick={() => setShowAllScored((v) => !v)}
              className="mt-3 as-btn as-btn-sm as-btn-secondary"
            >
              {showAllScored ? (
                <>
                  Show fewer <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                </>
              ) : (
                <>
                  Show all {filteredScored.length}{" "}
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </section>
      ) : null}

    </div>
  );
}
