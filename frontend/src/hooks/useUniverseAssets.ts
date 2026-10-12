import { supabase } from "../lib/supabase";
import { isRecentlyDiscovered } from "../utils/discovery";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

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

type UniverseAssets = {
  all: UniverseAsset[];
  byUniverse: Record<string, UniverseAsset[]>;
};

// The assets table changes when the nightly discovery job adds or benches a company,
// so this only decides how soon a page left open picks that up.
const ASSETS_FRESH_MS = 10 * MINUTE;
// One empty answer for every render before the first read, so callers memoising on
// `all` stay stable.
const NO_ASSETS: UniverseAssets = { all: [], byUniverse: {} };

// The active/quarantine filter matters: the discovery agent soft-retires and
// benches rows rather than deleting them, so an unfiltered read keeps showing
// companies the agent has already dropped.
async function loadUniverseAssets(): Promise<UniverseAssets> {
  const { data, error } = await supabase
    .from("assets")
    .select(
      "ticker, name, universe, description, origin, first_discovered_at, quarantined_until",
    )
    .eq("is_active", true)
    .order("ticker", { ascending: true });
  if (error) throw error;

  const now = Date.now();
  const all: UniverseAsset[] = [];
  const byUniverse: Record<string, UniverseAsset[]> = {};

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
    all.push(asset);
    (byUniverse[u] ??= []).push(asset);
  }

  return { all, byUniverse };
}

// Loads every asset once and groups them by investment universe, so the whale
// watching drill-down navigates instantly with no per-click fetch. The assets
// table is small (a few dozen rows even with the discovered pool). Cached
// (utils/responseCache), so returning to Whale Watching from another page shows the
// universes at once rather than the page skeleton.
export function useUniverseAssets() {
  const { data, isLoading, error } = useCachedFetch(
    "universe-assets",
    loadUniverseAssets,
    () => ASSETS_FRESH_MS,
    "Unable to load stocks right now.",
  );
  const { all, byUniverse } = data ?? NO_ASSETS;
  return { byUniverse, all, isLoading, error };
}
