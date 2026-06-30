import { useEffect, useState } from "react";

interface UseStaleAutoRefreshParams {
  /** Whether the latest run predates the most recent nightly refresh. */
  isStale: boolean;
  /** Whether a refresh is already in flight. */
  isRunning: boolean;
  /** Whether the dashboard is ready (data loaded, profile available). */
  ready: boolean;
  /** The refresh action to fire once when stale. */
  refresh: () => void | Promise<void>;
}

/**
 * Self-heals returning users: fires a single automatic refresh when their data
 * is stale, so they see fresh insights without pressing the button. Guarded so
 * it never loops — even if the refresh fails it won't retry on its own.
 */
export function useStaleAutoRefresh({
  isStale,
  isRunning,
  ready,
  refresh,
}: UseStaleAutoRefreshParams): void {
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    if (!ready || triggered || isRunning) return;
    if (isStale) {
      setTriggered(true);
      void refresh();
    }
    // `refresh` is intentionally excluded: the call is one-shot and guarded by
    // `triggered`, so we don't want identity changes to re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isStale, isRunning, triggered]);
}
