import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Sparkles,
  Download,
  ArrowRight,
  RefreshCw,
  BrainCircuit,
} from "lucide-react";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useAuthStore } from "../store/authStore";
import { type AssetRecommendation } from "../hooks/useDashboardStats";
import { supabase } from "../lib/supabase";
import { type AssetSearchResult } from "../hooks/useWatchlistData";

import ConfidenceRing from "../components/dashboard/ConfidenceRing";
import DualBar from "../components/dashboard/DualBar";
import RecommendationCard from "../components/dashboard/RecommendationCard";
import SignalScorecard from "../components/dashboard/SignalScorecard";
import { SCORECARD_ENABLED } from "../hooks/useDashboardStats";
import { CONVERGENCE_HEADLINE, CONVERGENCE_DETAIL } from "../data/signalCopy";
import { discoveryProvenance } from "../utils/discovery";
import DashboardSkeleton from "../components/dashboard/DashboardSkeleton";
import WatchlistSearch from "../components/watchlist/WatchlistSearch";

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

export default function DashboardPage() {
  const {
    search,
    setSearch,
    recommendations,
    topPick,
    filteredRecs,
    isLoadingRecs,
    isRunInProgress,
    recommendationError,
    latestRunCreatedAt,
    refreshRecommendations,
  } = useDashboardStats();

  // Temporary toggle to hide header controls during this iteration
  const hideHeaderControls = true;

  function getTimeGreeting(): string {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    return "Good evening";
  }

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

  const {
    profile,
    analysis,
    isLoading,
    isProfileLoading,
    setSession,
    fetchProfile,
  } = useAuthStore();
  const navigate = useNavigate();

  const [isRunning, setIsRunning] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [exchangeRateSource, setExchangeRateSource] =
    useState<string>("Yahoo Finance");

  // ── Watchlist search (inline — no separate hook needed) ────────────────
  const [wlSearch, setWlSearch]   = useState("");
  const [wlResults, setWlResults] = useState<any[]>([]);
  const [wlLoading, setWlLoading] = useState(false);

  const BASE = import.meta.env.VITE_API_BASE ?? "";

  useEffect(() => {
    if (!wlSearch.trim()) { setWlResults([]); return; }
    const timer = setTimeout(async () => {
      setWlLoading(true);
      try {
        const res  = await fetch(`${BASE}/api/assets/search?q=${encodeURIComponent(wlSearch)}`);
        const data = res.ok ? await res.json() : { results: [] };
        setWlResults(data.results || []);
      } catch { setWlResults([]); }
      setWlLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [wlSearch, BASE]);

const handleAddToWatchlist = async (result: AssetSearchResult) => {
  if (!profile?.id) return;
  const { error } = await supabase
    .from("user_watchlist_assets")
    .insert({
      user_id: profile.id,
      ticker:  result.ticker,
      ...(result.asset_id ? { asset_id: result.asset_id } : {}),
    });
  if (!error) setWlSearch("");
};

  const escapeCsvValue = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const handleExport = () => {
    if (!recommendations.length) return;

    const sortedRecommendations = [...recommendations].sort(
      (a, b) => a.rank - b.rank,
    );

    const metadataRows = [
      ["AlphaSwarm Dashboard Export"],
      [""],
      ["Generated At", new Date().toISOString()],
      ["Latest AI Run", latestRunCreatedAt ?? "—"],
      [
        "FX Rate (USD/ZAR)",
        exchangeRate !== null
          ? `1 USD = R${exchangeRate.toFixed(2)}`
          : "Unavailable",
      ],
      ["Recommendation Count", String(sortedRecommendations.length)],
      ["Portfolio Currency", "ZAR (South African Rand)"],
      [""],
    ];

    const headerRow = [
      "Rank",
      "Ticker",
      "Company",
      "Price (ZAR)",
      "Confidence Score",
      "Quantitative Score",
      "Sentiment Score",
      "Hype Penalty",
      "Hype Flag",
      "Top Pick",
      // Disclosed ranking factors (null on runs recorded before they existed).
      "Signals",
      "Signal Direction",
      "Signal Strength",
      "Agreement",
      "Evidence Depth",
      "Profile Fit",
      "Quant Position (pctile)",
    ];

    const dataRows = sortedRecommendations.map((asset) => [
      asset.rank,
      asset.ticker,
      asset.name,
      asset.currentPrice.toFixed(2),
      asset.confidenceScore,
      asset.fundamentalsScore,
      asset.sentimentScore,
      asset.hypePenalty,
      asset.isHype ? "Yes" : "No",
      asset.rank === 1 ? "Yes" : "No",
      asset.convergenceState
        ? CONVERGENCE_HEADLINE[asset.convergenceState]
        : "n/a",
      asset.signalDirection ?? "n/a",
      asset.signalStrength !== null ? asset.signalStrength.toFixed(3) : "n/a",
      asset.convergence !== null ? asset.convergence.toFixed(3) : "n/a",
      asset.dataSufficiency !== null ? asset.dataSufficiency.toFixed(3) : "n/a",
      asset.profileFit !== null ? asset.profileFit.toFixed(3) : "n/a",
      asset.quantLean !== null
        ? Math.round(((asset.quantLean + 1) / 2) * 100)
        : "n/a",
    ]);

    const csvLines = [
      // Metadata block
      ...metadataRows.map((row) => row.map(escapeCsvValue).join(",")),

      // Spacer row
      "",

      // Header row
      headerRow.map(escapeCsvValue).join(","),

      // Data rows
      ...dataRows.map((row) => row.map(escapeCsvValue).join(",")),
    ];

    const blob = new Blob([csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `alphaswarm-dashboard-export-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(anchor);
    anchor.click();

    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  };

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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {}
    setSession(null);
    navigate("/", { replace: true });
  };

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
    <div className="space-y-6 pt-10 px-8 pb-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-fg">
              {getTimeGreeting()}
              {profile?.first_name ? `, ${profile.first_name}` : ""}
            </h1>
            <p className="text-brand-muted-fg text-sm mt-1">
              Here's what your AI Investment Committee recommends today.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-brand-muted-fg">
          <span>
            Last AI run:{" "}
            {latestRunCreatedAt
              ? new Date(latestRunCreatedAt).toLocaleString()
              : "—"}
          </span>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-danger/30 border border-danger hover:border-danger hover:text-background hover:bg-danger text-danger text-sm font-medium text-semantic-danger hover:bg-semantic-danger/20"
          >
            Sign out
          </button>
          <button
            onClick={handleExport}
            disabled={!recommendations.length}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-primary text-brand-bg text-sm font-semibold hover:opacity-90 shadow-lg shadow-brand-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent/95 hover:shadow-glow-accent text-brand-fg text-sm font-medium hover:bg-accent/70 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4 text-brand-fg" />
            {isRunning ? "Running..." : "Refresh"}
          </button>
          <div
            className={
              hideHeaderControls
                ? "hidden"
                : "flex items-center gap-2 flex-wrap"
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
        </div>
      </div>
      <div className="inline-flex w-fit items-center rounded-lg border border-brand-border/50 bg-brand-bg/60 backdrop-blur-xl px-4 py-2 text-xs text-brand-muted-fg">
        {exchangeRate !== null ? (
          <>
            US Stock Exchanges • FX (USD/ZAR) from {exchangeRateSource}:{" "}
            <span className="font-medium text-brand-fg">
              1 USD = R{exchangeRate.toFixed(2)}
            </span>
          </>
        ) : (
          <span className="animate-pulse">
            US Stock Exchanges • Fetching USD/ZAR rate...
          </span>
        )}
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

      {/* Watchlist Search */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-muted-fg mb-2">
          Add to Watchlist
        </p>
        <WatchlistSearch
          search={wlSearch}
          setSearch={setWlSearch}
          searchResults={wlResults}
          searchLoading={wlLoading}
          onAdd={handleAddToWatchlist}
        />
      </div>

      {/* Grid */}
      <div>
        <h2 className="text-2xl font-semibold text-brand-fg mb-4">
          Personalized Recommendations
        </h2>
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
            {filteredRecs.map((asset: AssetRecommendation, i: number) => {
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