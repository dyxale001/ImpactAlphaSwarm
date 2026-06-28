import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

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
}

export function useDashboardStats() {
  const { profile } = useAuthStore();
  const [recs, setRecs] = useState<AssetRecommendation[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(true);
  const [recommendationError, setRecommendationError] = useState<string | null>(
    null,
  );
  const [latestRunCreatedAt, setLatestRunCreatedAt] = useState<string | null>(null);
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
            price_at_run
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
              .select("id, ticker, name")
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
              isHype: (rec.hype_penalty ?? 0) > 0,
              rank: rec.rank ?? 0,
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
