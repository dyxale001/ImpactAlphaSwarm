import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import type { ConvergenceState } from "../data/signalCopy";

export interface AssetRecommendation {
  assetId: string;
  ticker: string;
  name: string;
  currentPrice: number;
  confidenceScore: number;
  fundamentalsScore: number;
  sentimentScore: number;
  reasoning: string;
  hypePenalty: number;
  isHype: boolean;
  rank: number;
  isDiscovered: boolean;
  discoverySources: string[] | null;
  // Unified ranking v2 terms (migration 010). Null on legacy rows and whenever the
  // backend ranking is disabled, which is what the legacy display falls back on.
  signalStrength: number | null;
  signalDirection: string | null;
  convergence: number | null;
  convergenceState: ConvergenceState | null;
  dataSufficiency: number | null;
  profileFit: number | null;
  quantLean: number | null;
  quantState: string | null;
  hasSignalTerms: boolean;
}

/** Show the disclosed scorecard instead of the confidence score.
 *
 * Separate from the backend flag on purpose. In shadow mode the backend WRITES the
 * v2 terms while still ordering the feed by the legacy score — so rendering the
 * scorecard then would explain a placement those terms did not decide. This flag
 * flips only when the backend ranking goes live. */
export const SCORECARD_ENABLED =
  (import.meta.env.VITE_UNIFIED_SCORECARD ?? "false") === "true";

export function useDashboardStats() {
  const { profile } = useAuthStore();
  const [recs, setRecs] = useState<AssetRecommendation[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(true);
  const [recommendationError, setRecommendationError] = useState<string | null>(
    null,
  );
  const [latestRunCreatedAt, setLatestRunCreatedAt] = useState<string | null>(
    null,
  );
  const [isRunInProgress, setIsRunInProgress] = useState(false);
  const [search, setSearch] = useState("");

  const fetchRecommendations = useCallback(async () => {
    try {
      setIsLoadingRecs(true);
      setRecommendationError(null);

      if (!profile?.id) {
        setRecs([]);
        setLatestRunCreatedAt(null);
        setRecommendationError(
          "Unable to load dashboard data until your profile is available.",
        );
        return;
      }

      // 1. Get the latest AI run for this user only.
      const { data: userLatestRun, error: userRunError } = await supabase
        .from("ai_runs")
        .select("id, created_at, status")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (userRunError) {
        throw userRunError;
      }

      const latestRunId = userLatestRun?.id ?? null;
      setLatestRunCreatedAt(userLatestRun?.created_at ?? null);
      setIsRunInProgress(userLatestRun?.status === "running");

      if (userLatestRun?.status === "running") {
        setRecommendationError(null);
        return;
      }

      if (!latestRunId) {
        setRecs([]);
        setLatestRunCreatedAt(null);
        setRecommendationError(
          "No AI runs are associated with your account yet.",
        );
        return;
      }

      // 2. Fetch top 5 assets and join with the dictionary.
      const { data: recommendations, error: recError } = await supabase
        .from("ai_recommendation")
        .select(
          `
            asset_id,
            rank,
            confidence_score,
            quant_score,
            sentiment_score,
            reasoning_trace,
            hype_penalty,
            price_at_run,
            signal_strength,
            signal_direction,
            convergence,
            convergence_state,
            data_sufficiency,
            profile_fit,
            quant_lean,
            quant_state
          `,
        )
        .eq("run_id", latestRunId)
        .order("rank", { ascending: true })
        .limit(5);

      if (recError) {
        throw recError;
      }

      const assetIds = Array.from(
        new Set(
          (recommendations ?? [])
            .map((rec: any) => rec.asset_id)
            .filter(Boolean),
        ),
      );

      const { data: assets, error: assetsError } = assetIds.length
        ? await supabase
            .from("assets")
            .select("id, ticker, name, origin, discovery_sources")
            .in("id", assetIds)
        : { data: [], error: null };

      if (assetsError) {
        throw assetsError;
      }

      const assetById = new Map(
        (assets ?? []).map((asset: any) => [asset.id, asset]),
      );

      // 3. Map to frontend format.
      const recommendationRows = recommendations ?? [];

      const formattedRecs: AssetRecommendation[] = recommendationRows.map(
        (rec: any) => {
          const asset = assetById.get(rec.asset_id);
          const ticker = asset?.ticker ?? "";
          const name = asset?.name ?? ticker;

          return {
            assetId: rec.asset_id,
            ticker,
            name,
            currentPrice: Number(rec.price_at_run ?? 0),
            confidenceScore: rec.confidence_score ?? 0,
            fundamentalsScore: rec.quant_score ?? 0,
            sentimentScore: rec.sentiment_score ?? 0,
            reasoning: rec.reasoning_trace ?? "",
            hypePenalty: rec.hype_penalty ?? 0,
            // The stored penalty is NEGATIVE (-25, see synthesize_rankings), so the
            // old `> 0` test could never be true: the "Hype flagged" chip and the
            // CSV "Hype Flag" column have always read false regardless of the data.
            isHype: (rec.hype_penalty ?? 0) < 0,
            rank: rec.rank ?? 0,
            isDiscovered: asset?.origin === "discovered",
            discoverySources: (asset?.discovery_sources as string[] | null) ?? null,
            signalStrength: rec.signal_strength ?? null,
            signalDirection: rec.signal_direction ?? null,
            convergence: rec.convergence ?? null,
            convergenceState: (rec.convergence_state as ConvergenceState) ?? null,
            dataSufficiency: rec.data_sufficiency ?? null,
            profileFit: rec.profile_fit ?? null,
            quantLean: rec.quant_lean ?? null,
            quantState: rec.quant_state ?? null,
            // Only treat the row as scorecard-ready when the ordering factors are
            // actually present — legacy rows must fall back, not render blanks.
            hasSignalTerms: rec.convergence_state != null && rec.signal_strength != null,
          };
        },
      );

      setRecs(formattedRecs);
    } catch (error) {
      setRecs([]);
      setLatestRunCreatedAt(null);
      setRecommendationError(
        "We couldn't load your dashboard recommendations right now.",
      );
    } finally {
      setIsLoadingRecs(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  useEffect(() => {
    if (!profile?.id || !isRunInProgress) return;

    const interval = window.setInterval(() => {
      void fetchRecommendations();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [profile?.id, isRunInProgress, fetchRecommendations]);

  // Derived State
  const searchedRecs = recs.filter(
    (r) =>
      r.ticker.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase()),
  );

  const topPick = searchedRecs.find((r) => r.rank === 1);
  const filteredRecs = searchedRecs.filter((r) => r.rank !== 1);

  const avgConfidence =
    recs.length > 0
      ? Math.round(
          recs.reduce((acc, curr) => acc + curr.confidenceScore, 0) /
            recs.length,
        )
      : 0;

  const hypeCount = recs.filter((r) => r.isHype).length;
  const strong = recs.filter((r) => r.confidenceScore >= 70).length;
  const moderate = recs.filter(
    (r) => r.confidenceScore >= 50 && r.confidenceScore < 70,
  ).length;
  const cautious = recs.filter((r) => r.confidenceScore < 50).length;
  const pct = (val: number) =>
    recs.length ? Math.round((val / recs.length) * 100) : 0;

  const sparkPoints =
    recs.length > 0
      ? recs
          .map((a, i) => `${i * 25},${40 - (a.confidenceScore / 100) * 32}`)
          .join(" ")
      : "0,40 100,40";

  return {
    search,
    setSearch,
    recommendations: recs,
    topPick,
    filteredRecs,
    avgConfidence,
    hypeCount,
    strong,
    moderate,
    cautious,
    pct,
    sparkPoints,
    isLoadingRecs,
    isRunInProgress,
    recommendationError,
    latestRunCreatedAt,
    refreshRecommendations: fetchRecommendations,
  };
}
