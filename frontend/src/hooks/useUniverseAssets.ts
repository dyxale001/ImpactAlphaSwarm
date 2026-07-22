import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface UniverseAsset {
  ticker: string;
  name: string;
  universe: string;
}

// Loads every asset once and groups them by investment universe, so the whale
// watching drill-down (universe -> ticker) navigates instantly with no per-click
// fetch. The assets table is small (~50 rows).
export function useUniverseAssets() {
  const [byUniverse, setByUniverse] = useState<Record<string, UniverseAsset[]>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabase
          .from("assets")
          .select("ticker, name, universe")
          .order("ticker", { ascending: true });
        if (qErr) throw qErr;
        if (cancelled) return;

        const grouped: Record<string, UniverseAsset[]> = {};
        for (const row of (data ?? []) as UniverseAsset[]) {
          const u = (row.universe ?? "").trim();
          if (!u) continue; // skip uncategorized assets (e.g. seed rows)
          (grouped[u] ??= []).push(row);
        }
        setByUniverse(grouped);
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading universe assets:", e);
        setError("Unable to load assets right now.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { byUniverse, isLoading, error };
}
