import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { startAnalysis, getStatus, getResult } from "../services/api/analysis";
import { pollUntilComplete } from "../services/api/poll";

/**
 * Runs the analysis pipeline for the current user with their saved preferences,
 * polls until it completes, then refreshes the profile so the dashboard picks up
 * the new run. Backs both the manual "Refresh" button and the automatic
 * stale-data refresh.
 */
export function useAnalysisRefresh() {
  const { profile, analysis, fetchProfile } = useAuthStore();
  const [isRunning, setIsRunning] = useState(false);

  const refresh = async () => {
    if (!profile?.id) return;

    setIsRunning(true);
    try {
      const universes = Array.isArray(analysis?.investment_universe)
        ? analysis.investment_universe
        : [];

      const { run_id } = await startAnalysis({
        universes,
        watchlist: [],
        risk_tolerance: analysis?.risk_tolerance ?? "Moderate",
        expertise_level: analysis?.ai_derived_expertise ?? "novice",
      });

      await pollUntilComplete(run_id, getStatus, getResult);
      await fetchProfile(profile.id);
    } catch (e) {
      console.error("Refresh analysis failed:", e);
    } finally {
      setIsRunning(false);
    }
  };

  return { isRunning, refresh };
}
