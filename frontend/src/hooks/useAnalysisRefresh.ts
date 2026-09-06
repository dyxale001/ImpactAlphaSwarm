import type {
  AnalysisLoadingStage,
  AnalysisProgress,
} from "../types/analysisLifecycle";
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
export function useAnalysisRefresh(onComplete?: () => Promise<void>) {
  const { profile, analysis, fetchProfile } = useAuthStore();
  const [stage, setStage] = useState<AnalysisLoadingStage | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const isRunning = stage !== null;
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!profile?.id) return;

    setStage("preparing");
    setProgress(null);
    setError(null);
    let hasStartedRun = false;
    let runFinished = false;
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

      hasStartedRun = true;
      setStage("processing");
      await pollUntilComplete(run_id, getStatus, getResult, (status) => {
        if (status.id !== run_id) return;
        setProgress(status.progress);
        if (status.status === "complete") {
          runFinished = true;
          setStage("results");
        }
        if (status.status === "failed") {
          runFinished = true;
          setStage(null);
        }
      });
      runFinished = true;
      await fetchProfile(profile.id);
      await onComplete?.();
    } catch (e) {
      console.error("Refresh analysis failed:", e);
      setError(
        "We couldn’t finish checking your analysis. It may still be running. Try checking again.",
      );
      if (!hasStartedRun) setStage(null);
    } finally {
      if (runFinished) {
        setStage(null);
        setProgress(null);
      }
    }
  };

  return {
    isRunning,
    stage,
    progress,
    refresh,
    error,
    clearError: () => setError(null),
  };
}
