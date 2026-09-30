import { useState, useEffect } from "react";
import {
  getInstitutionalTrace,
  type InstitutionalTraceResponse,
} from "../services/api/analysis";

// Fetches the Big investors tab's reasoning trace. Separate from the ownership data so
// the figures render straight away; a first read can wait on a model call, and the
// panel shows its own skeleton meanwhile.
export function useInstitutionalTrace(ticker: string | undefined, enabled = true) {
  const [trace, setTrace] = useState<InstitutionalTraceResponse | null>(null);
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
        const res = await getInstitutionalTrace(ticker);
        if (cancelled) return;
        setTrace(res);
      } catch (e) {
        if (cancelled) return;
        console.error("Error fetching institutional trace:", e);
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
  }, [ticker, enabled]);

  return { trace, isLoading, error };
}
