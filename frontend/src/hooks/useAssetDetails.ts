import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

export function useAssetDetails(ticker: string | undefined) {
  const { profile } = useAuthStore();
  const [asset, setAsset] = useState<any>(null);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [latestRunCreatedAt, setLatestRunCreatedAt] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  // Paper Trading State
  const [isBuying, setIsBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState(false);

  useEffect(() => {
    async function fetchDetails() {
      if (!ticker || !profile?.id) {
        setLatestRunCreatedAt(null);
        setRecommendation(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);

      try {
        // 1. Fetch the exact asset from the dictionary
        const { data: assetData, error: assetError } = await supabase
          .from("assets")
          .select("*")
          .eq("ticker", ticker.toUpperCase())
          .single();

        if (assetError) throw assetError;
        setAsset(assetData);

        // 2. Find the user's latest AI run
        const { data: latestRun } = await supabase
          .from("ai_runs")
          .select("id, created_at")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setLatestRunCreatedAt(latestRun?.created_at ?? null);

        if (latestRun) {
          // 3. Fetch the specific recommendation for this asset in that run
          const { data: recData } = await supabase
            .from("ai_recommendation")
            .select("*")
            .eq("run_id", latestRun.id)
            .eq("asset_id", assetData.id)
            .maybeSingle();

          setRecommendation(recData ?? null);
        } else {
          setRecommendation(null);
        }
      } catch (error) {
        console.error("Error fetching asset details:", error);
        setLatestRunCreatedAt(null);
        setRecommendation(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDetails();
  }, [ticker, profile]);

  // The Paper Trading Execution Function
  const handleBuy = async (quantity: number) => {
    if (!profile?.id || !asset?.id || quantity <= 0) return;

    setIsBuying(true);
    setBuySuccess(false);

    try {
      const { error } = await supabase.from("user_portfolio_assets").insert({
        user_id: profile.id,
        asset_id: asset.id,
        buy_price: asset.current_price,
        quantity: quantity,
        purchased_at: new Date().toISOString(),
        status: "OPEN",
      });

      if (error) throw error;

      setBuySuccess(true);
      setTimeout(() => setBuySuccess(false), 3000); // Hide success message after 3s
    } catch (error) {
      console.error("Error buying asset:", error);
      alert("Failed to execute paper trade.");
    } finally {
      setIsBuying(false);
    }
  };

  return {
    asset,
    recommendation,
    isLoading,
    handleBuy,
    isBuying,
    buySuccess,
    latestRunCreatedAt,
  };
}
