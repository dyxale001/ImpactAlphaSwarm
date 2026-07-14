import { useState, useEffect } from "react";
import { getTopFunds, type FundHolding } from "../services/api/analysis";

// Loads the per-fund holdings aggregation (institutional data inverted across all
// tracked assets), shared by the Top Funds and Notable Investors tabs.
export function useTopFunds() {
  const [funds, setFunds] = useState<FundHolding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getTopFunds();
        if (cancelled) return;
        setFunds(res.funds ?? []);
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading top funds:", e);
        setError("Unable to load fund holdings right now.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { funds, isLoading, error };
}
