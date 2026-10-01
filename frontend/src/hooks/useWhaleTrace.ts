import { useState, useEffect } from "react";
import {
  getInsiderTrace,
  getInstitutionalTrace,
  type WhaleTraceResponse,
} from "../services/api/analysis";

const FETCHERS = {
  institutions: getInstitutionalTrace,
  insiders: getInsiderTrace,
} as const;

export type WhaleTraceKind = keyof typeof FETCHERS;

// Fetches one whale tab's AI summary. Separate from the tab's own data so the figures
// render straight away; a first read can wait on a model call, and the panel shows its
// own skeleton meanwhile.
export function useWhaleTrace(
  ticker: string | undefined,
  kind: WhaleTraceKind,
  enabled = true,
) {
  const [trace, setTrace] = useState<WhaleTraceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!ticker || !enabled) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await FETCHERS[kind](ticker);
        if (cancelled) return;
        setTrace(res);
      } catch (e) {
        if (cancelled) return;
        console.error(`Error fetching ${kind} summary:`, e);
        setError("The written summary could not be loaded.");
        setTrace(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ticker, kind, enabled]);

  return { trace, isLoading, error };
}
