import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// How long a discovered company keeps its "New" badge after the asset-discovery
// agent first picked it up.
const NEW_COMPANY_DAYS = 7;

export interface UniverseAsset {
  ticker: string;
  name: string;
  universe: string;
  // Plain-English blurb of what the company does, written by the nightly LLM
  // backfill. Null until that has run for a newly discovered ticker.
  description: string | null;
  origin: string | null;
  first_discovered_at: string | null;
  /** Discovered by the asset-discovery agent within the last week. */
  isNew: boolean;
}

function isRecentlyDiscovered(row: {
  origin?: string | null;
  first_discovered_at?: string | null;
}): boolean {
  if (row.origin !== "discovered" || !row.first_discovered_at) return false;
  const days =
    (Date.now() - new Date(row.first_discovered_at).getTime()) / 86_400_000;
  return days >= 0 && days <= NEW_COMPANY_DAYS;
}

// Loads every asset once and groups them by investment universe, so the whale
// watching drill-down navigates instantly with no per-click fetch. The assets
// table is small (a few dozen rows even with the discovered pool).
//
// The active/quarantine filter matters: the discovery agent soft-retires and
// benches rows rather than deleting them, so an unfiltered read keeps showing
// companies the agent has already dropped.
export function useUniverseAssets() {
  const [byUniverse, setByUniverse] = useState<Record<string, UniverseAsset[]>>(
    {},
  );
  const [all, setAll] = useState<UniverseAsset[]>([]);
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
          .select(
            "ticker, name, universe, description, origin, first_discovered_at, quarantined_until",
          )
          .eq("is_active", true)
          .order("ticker", { ascending: true });
        if (qErr) throw qErr;
        if (cancelled) return;

        const now = Date.now();
        const rows: UniverseAsset[] = [];
        const grouped: Record<string, UniverseAsset[]> = {};

        for (const row of data ?? []) {
          const u = (row.universe ?? "").trim();
          if (!u) continue; // skip uncategorized assets
          // Quarantined rows are benched until their expiry; filtered here
          // rather than in the query so the comparison uses the client clock
          // consistently with the badge logic above.
          if (
            row.quarantined_until &&
            new Date(row.quarantined_until).getTime() > now
          ) {
            continue;
          }

          const asset: UniverseAsset = {
            ticker: row.ticker,
            name: row.name,
            universe: u,
            description: row.description ?? null,
            origin: row.origin ?? null,
            first_discovered_at: row.first_discovered_at ?? null,
            isNew: isRecentlyDiscovered(row),
          };
          rows.push(asset);
          (grouped[u] ??= []).push(asset);
        }

        setAll(rows);
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

  return { byUniverse, all, isLoading, error };
}
