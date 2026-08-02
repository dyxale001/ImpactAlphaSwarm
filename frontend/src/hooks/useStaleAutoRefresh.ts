import { useEffect, useRef } from "react";

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
  // A ref, not state: StrictMode double-invokes the mount effect (setup → cleanup
  // → setup) BEFORE a state update re-renders, so with useState both setups saw
  // `triggered === false` and fired two analyses milliseconds apart. A ref is
  // written synchronously, so the second setup sees the guard already closed.
  // (The backend claim in acquire_ai_run is the authoritative protection — it also
  // covers two tabs and nightly-vs-manual overlap, which no frontend guard can.)
  const triggered = useRef(false);

  useEffect(() => {
    if (!ready || triggered.current || isRunning) return;
    if (isStale) {
      triggered.current = true;
      void refresh();
    }
    // `refresh` is intentionally excluded: the call is one-shot and guarded by
    // `triggered`, so we don't want identity changes to re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isStale, isRunning]);
}
