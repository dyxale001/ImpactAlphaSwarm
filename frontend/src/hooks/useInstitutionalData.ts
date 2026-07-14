import { useState, useEffect } from "react";
import {
  getInstitutionalHolders,
  type InstitutionalOwnershipResponse,
} from "../services/api/analysis";

// Fetches institutional (13F) ownership for a ticker. Informational only —
// independent of the AI run, like the insider-dealings panel.
export function useInstitutionalData(ticker: string | undefined) {
  const [data, setData] = useState<InstitutionalOwnershipResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!ticker) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await getInstitutionalHolders(ticker);
        if (cancelled) return;
        setData(res);
      } catch (e) {
        if (cancelled) return;
        console.error("Error fetching institutional ownership:", e);
        setError("Unable to load institutional ownership.");
        setData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return { data, isLoading, error };
}
