import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Sparkles,
  ArrowRight,
  RefreshCw,
  BrainCircuit,
  CandlestickChart,
  ChevronDown,
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
import { CONVERGENCE_DETAIL } from "../data/signalCopy";
import { discoveryProvenance } from "../utils/discovery";
import DashboardSkeleton from "../components/dashboard/DashboardSkeleton";
import LadderMotif from "../components/dashboard/LadderMotif";
import ScoredAssetRow from "../components/dashboard/ScoredAssetRow";

import {
  startAnalysis,
  getStatus,
  getResult,
  getUsdZarExchangeRate,
} from "../services/api/analysis";
import { pollUntilComplete } from "../services/api/poll";
import { useAnalysisRefresh } from "../hooks/useAnalysisRefresh";
import { useStaleAutoRefresh } from "../hooks/useStaleAutoRefresh";
import { isRunStale } from "../utils/staleness";
import StaleDataBanner from "../components/dashboard/StaleDataBanner";

/** Assets that got an LLM-written trace, and so are shown as full cards. Mirrors
 *  REASONING_TRACE_TOP_N on the backend; everything below this rank carries the
 *  deterministic trace instead and is shown as a row. */
const SHORTLIST_SIZE = 5;
/** Rows shown before the "Show all" toggle, matching the house pattern in
 *  FundHoldingsView. */
const INITIAL_ROWS = 12;

export default function AssetsPage() {
  const {
    search,
    setSearch,
    topPick,
    filteredRecs,
    isLoadingRecs,
    isRunInProgress,
    recommendationError,
    latestRunCreatedAt,
    recommendations,
    refreshRecommendations,
    // The whole ranked feed, not the dashboard's five. The page's own subtitle
    // promises everything the committee ranked, and a run scores about thirty.
  } = useDashboardStats({ limit: null });

  // Ranks 2 to 5: shortlisted, shown as cards alongside the hero at rank 1.
  const shortlisted = filteredRecs.filter((r) => r.rank <= SHORTLIST_SIZE);
  // Everything else the run scored. Same data, lighter treatment.
  const alsoScored = filteredRecs.filter((r) => r.rank > SHORTLIST_SIZE);

  const [showAllScored, setShowAllScored] = useState(false);
  const visibleScored = showAllScored
    ? alsoScored
    : alsoScored.slice(0, INITIAL_ROWS);

  // Temporary toggle to hide header controls during this iteration
  const hideHeaderControls = true;

  // The top pick's preview tabs were removed alongside the cards': they restated
  // numbers already shown, and the "Hype Risk Assessment" tab described the
  // penalty that convergence replaced. The reasoning trace is what remains.
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

  const [isRunning, setIsRunning] = useState(false);
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
  const { refresh, isRunning: isAutoRefreshRunning } = useAnalysisRefresh();
  const anyRunInFlight = isRunning || isAutoRefreshRunning;
  const isStale = isRunStale(latestRunCreatedAt);

  const handleRefresh = async () => {
    if (!profile?.id) return;

    setIsRunning(true);
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

      await refreshRecommendations();

      await pollUntilComplete(run_id, getStatus, getResult);
      await fetchProfile(profile.id);
      await refreshRecommendations();
      await loadExchangeRate();
    } catch (e) {
      console.error("Refresh analysis failed:", e);
    } finally {
      setIsRunning(false);
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
    isRunning: anyRunInFlight,
    ready: !currentlyLoading && Boolean(profile?.id),
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

  const showDashboardSkeleton =
    anyRunInFlight || isRunInProgress || isLoadingRecs;

  if (showDashboardSkeleton) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-10 max-w-7xl mx-auto">
      {/* Header band. Forest ground with columns climbing toward the
          bottom-right corner — the ranked universe, tallest column first.
          Content sits on a relative layer so it clears the SVG. */}
      <div className="hero-card overflow-hidden px-5 sm:px-7 py-6">
        <LadderMotif className="h-16" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-accent mb-1">
              AI Recommendations
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold text-brand-bg flex items-center gap-3">
              <CandlestickChart className="w-7 h-7 shrink-0 text-brand-accent" />
              Assets
            </h1>
            <p className="text-sm text-brand-bg/75 mt-2 max-w-2xl leading-relaxed">
              Everything your AI Investment Committee ranked in the latest run.
            </p>
            {/* Market and FX footing for every price on the page, so it reads
                as part of the run rather than a stray note below the header. */}
            <div className="mt-3 inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-brand-bg/70">
              {exchangeRate !== null ? (
                <>
                  US Stock Exchanges • FX (USD/ZAR) from {exchangeRateSource}:{" "}
                  <span className="font-medium text-brand-bg">
                    1 USD = R{exchangeRate.toFixed(2)}
                  </span>
                </>
              ) : (
                <span className="animate-pulse">
                  US Stock Exchanges • Fetching USD/ZAR rate...
                </span>
              )}
            </div>
          </div>

          {/* Run time and its refresh share one pill: the button acts on the
              timestamp beside it, so they read as a single control. */}
          <div className="lg:shrink-0 flex w-fit max-w-full flex-wrap items-center gap-3 rounded-full border border-white/10 bg-white/5 py-1.5 pl-5 pr-1.5">
            <span className="text-xs text-brand-bg/60">
              Last AI run{" "}
              <span className="font-semibold text-brand-bg">
                {latestRunCreatedAt
                  ? new Date(latestRunCreatedAt).toLocaleString()
                  : "—"}
              </span>
            </span>
            <button
              onClick={handleRefresh}
              disabled={isRunning}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-accent/95 hover:shadow-glow-accent text-brand-fg text-sm font-medium hover:bg-accent/70 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <RefreshCw className="w-4 h-4 text-brand-fg" />
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
            placeholder="Search assets..."
            className="w-full bg-brand-secondary/60 border border-brand-border rounded-full pl-10 pr-4 py-2.5 text-sm text-brand-fg focus:ring-2 focus:ring-brand-primary/40 focus:outline-none transition"
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
          WhaleWatching and Watchlist headers */}
      <div className="hero-card z-50 overflow-visible p-6">
        <Link
          to={`/asset/${topPick?.ticker}`}
          className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity w-fit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          <Sparkles className="w-4 h-4 text-brand-accent" />
          <span className="text-xs uppercase text-brand-accent font-semibold">
            {showTopPickScorecard
              ? "Highest signal for your profile"
              : "Top Pick Today"}
          </span>
        </Link>
        <div className="flex flex-col md:flex-row gap-6">
          {/* The scorecard is NOT wrapped in the asset Link: it contains its own
              explainer buttons, and nesting <button> inside <a> is invalid markup
              — it also made tapping an explainer navigate away instead of opening
              it. Only the plain ring stays clickable. */}
          {showTopPickScorecard ? (
            <div className="w-full md:w-64 shrink-0 rounded-2xl bg-white/5 border border-white/10 p-4">
              <SignalScorecard
                onDark
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
              className="hover:opacity-80 transition-opacity relative z-50 rounded-2xl bg-white/5 border border-white/10 p-4 self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <ConfidenceRing
                score={topPick?.confidenceScore || 0}
                label="Confidence Score"
                onDark
              />
            </Link>
          )}
          <div className="flex-1 space-y-3 w-full min-w-0">
            <Link
              to={`/asset/${topPick?.ticker}`}
              className="flex items-start gap-3 hover:opacity-80 transition-opacity w-fit"
            >
              <div>
                <h2 className="text-2xl font-bold font-mono text-brand-bg">
                  {topPick?.ticker}
                </h2>
                <span className="inline-block mt-2 px-3 py-1 bg-white/10 rounded-full text-xs font-mono text-brand-bg">
                  {topPick?.name}
                </span>
                <div className="text-xl font-mono text-brand-bg mt-3">
                  R{" "}
                  <span className="font-mono">
                    {topPick?.currentPrice?.toFixed(2)}
                  </span>
                </div>
              </div>
            </Link>
            {topPick?.isDiscovered ? (
              <span
                className="chip bg-brand-accent text-brand-fg w-fit"
                title={discoveryProvenance(topPick?.discoverySources)}
              >
                <Sparkles className="w-2.5 h-2.5" /> Discovered via trending
              </span>
            ) : null}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <DualBar
                sentimentScore={topPick?.sentimentScore || 0}
                quantitativeScore={topPick?.fundamentalsScore || 0}
                quantPercentile={topPickQuantPercentile}
                onDark
              />
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 w-full h-auto">
              <p className="text-[10px] text-brand-accent uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5">
                <BrainCircuit className="w-3 h-3" />
                Why it ranks here
              </p>
              <p className="text-xs text-brand-bg/85 leading-relaxed w-full">
                {topPickReasoning}
              </p>
            </div>
            <div className="flex items-center justify-start">
              <Link
                to={`/asset/${topPick?.ticker}`}
                className="text-xs text-brand-accent hover:underline flex items-center gap-1 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
              >
                Full analysis <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-2xl font-semibold text-brand-fg">
            Personalized Recommendations
          </h2>
          {recommendations.length > 0 ? (
            <span className="text-xs text-brand-muted-fg">
              {recommendations.length} assets scored this run
            </span>
          ) : null}
        </div>
        {recommendationError ? (
          <div className="bg-brand-bg/60 backdrop-blur-xl border border-brand-border/50 border-l-4 border-l-semantic-danger p-6 rounded-lg text-sm text-primary">
            <p className="font-semibold text-primary mb-2">
              No dashboard data available
            </p>
            <p>{recommendationError}</p>
          </div>
        ) : filteredRecs.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-primary">
            No recommendations available right now.
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
        <div className="mt-10">
          <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
            <h2 className="text-2xl font-semibold text-brand-fg">Also scored</h2>
            <span className="text-xs text-brand-muted-fg">
              {alsoScored.length} more
            </span>
          </div>
          <p className="text-sm text-brand-muted-fg mb-4">
            Ranked in the same run but outside the shortlist above. The committee
            writes its full reasoning for the top {SHORTLIST_SIZE}; these carry the
            summary it recorded for every asset it scored.
          </p>

          <ul className="divide-y divide-brand-border/40 rounded-2xl border border-brand-border/60 overflow-hidden">
            {visibleScored.map((asset: AssetRecommendation) => (
              <ScoredAssetRow key={asset.ticker} asset={asset} />
            ))}
          </ul>

          {alsoScored.length > INITIAL_ROWS && (
            <button
              type="button"
              onClick={() => setShowAllScored((v) => !v)}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-2.5 text-xs font-semibold text-brand-muted-fg hover:text-brand-fg hover:border-brand-primary/40 transition-colors"
            >
              {showAllScored ? (
                <>
                  Show fewer <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                </>
              ) : (
                <>
                  Show all {alsoScored.length} assets{" "}
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      ) : null}

      {/* Disclaimer Footer */}
      <div className="mt-12 pt-8 border-t border-brand-border/30">
        <div className="bg-brand-bg/60 backdrop-blur-xl border border-brand-border/50 rounded-lg p-4">
          <p className="text-xs text-brand-muted-fg leading-relaxed">
            <strong className="text-brand-fg block mb-2">Disclaimer:</strong>
            AlphaSwarm is an AI-powered analytical tool designed for
            informational and educational purposes only. Every figure shown is a
            measurement of public data produced by automated analysis, and the
            ordering of this list reflects those measurements plus a weighting we
            choose and disclose. Nothing here constitutes professional financial,
            investment or legal advice, and nothing predicts future prices. All
            trading involves risk; past performance is not indicative of future
            results. Please consult with a licensed financial advisor before
            making any investment decisions.
          </p>
        </div>
      </div>
    </div>
  );
}