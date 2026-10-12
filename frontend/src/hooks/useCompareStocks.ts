import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import type { ConvergenceState } from "../data/signalCopy";
import type { RunReading } from "../utils/compareStocks";

// What the Compare page needs about each picked stock that is not a price window:
// who it is (the assets row) and how the user's own latest completed run placed it.
//
// Read straight from Supabase under RLS, the way the dashboard and stock page do,
// because the run is personal and the policies already scope it to its owner.
//
// Completed runs only. The stock page reads the latest run whatever its status;
// here a run still going would show half its stocks as "not in your run", and a
// failed one would compare places that were never finished.

export interface CompareAsset {
  id: string;
  ticker: string;
  name: string | null;
  universe: string | null;
  /** Stored in rand already (see /api/assets/{ticker}/refresh). */
  currentPrice: number | null;
  description: string | null;
}

const REC_COLUMNS =
  "asset_id, rank, confidence_score, convergence_state, signal_strength, quant_lean, sent_lean, " +
  "profile_fit, data_sufficiency, momentum_pctile, risk_adj_pctile, stability_pctile, beta, " +
  "beta_band, sharpe_ratio, reasoning_trace";

// Without migration 010's ranking columns the wide select fails outright, so the
// narrow one is the fallback, as save_top_assets and Ask do on the backend.
const REC_COLUMNS_BASE = "asset_id, rank, confidence_score, beta, sharpe_ratio, reasoning_trace";

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A watchlist row's ticker. Some rows carry only the asset link (the dashboard's
 *  add button used to save no ticker), so the joined asset's ticker is the
 *  fallback, as the stocks page reads it. */
function watchlistTicker(row: { ticker?: string | null; assets?: unknown }): string {
  const joined = Array.isArray(row.assets) ? row.assets[0] : row.assets;
  const fromAsset = (joined as { ticker?: string | null } | null | undefined)?.ticker;
  return (row.ticker || fromAsset || "").toUpperCase();
}

export function useCompareStocks(tickers: string[]) {
  const { profile } = useAuthStore();
  const [assets, setAssets] = useState<Record<string, CompareAsset>>({});
  const [readings, setReadings] = useState<Record<string, RunReading>>({});
  const [runSize, setRunSize] = useState<number | null>(null);
  const [runDate, setRunDate] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = tickers.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (!list.length) {
      setAssets({});
      setReadings({});
      return;
    }
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const { data: assetRows, error: aErr } = await supabase
          .from("assets")
          .select("id, ticker, name, universe, current_price, description")
          .in("ticker", list);
        if (aErr) throw aErr;
        if (cancelled) return;

        const byTicker: Record<string, CompareAsset> = {};
        for (const row of assetRows ?? []) {
          byTicker[row.ticker] = {
            id: row.id,
            ticker: row.ticker,
            name: row.name ?? null,
            universe: row.universe ?? null,
            currentPrice: num(row.current_price),
            description: row.description ?? null,
          };
        }
        setAssets(byTicker);

        if (!profile?.id) {
          setHasRun(false);
          setReadings({});
          return;
        }

        const { data: run, error: rErr } = await supabase
          .from("ai_runs")
          .select("id, created_at")
          .eq("user_id", profile.id)
          .eq("status", "complete")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (rErr) throw rErr;
        if (cancelled) return;
        if (!run) {
          setHasRun(false);
          setReadings({});
          setRunSize(null);
          setRunDate(null);
          return;
        }
        setHasRun(true);
        setRunDate(run.created_at ?? null);

        const ids = Object.values(byTicker).map((a) => a.id);
        let recs: Record<string, unknown>[] = [];
        if (ids.length) {
          const wide = await supabase
            .from("ai_recommendation")
            .select(REC_COLUMNS)
            .eq("run_id", run.id)
            .in("asset_id", ids);
          if (wide.error) {
            const narrow = await supabase
              .from("ai_recommendation")
              .select(REC_COLUMNS_BASE)
              .eq("run_id", run.id)
              .in("asset_id", ids);
            if (narrow.error) throw narrow.error;
            recs = (narrow.data ?? []) as unknown as Record<string, unknown>[];
          } else {
            recs = (wide.data ?? []) as unknown as Record<string, unknown>[];
          }
        }

        const { count } = await supabase
          .from("ai_recommendation")
          .select("id", { count: "exact", head: true })
          .eq("run_id", run.id);
        if (cancelled) return;

        const tickerById: Record<string, string> = {};
        for (const a of Object.values(byTicker)) tickerById[a.id] = a.ticker;

        const next: Record<string, RunReading> = {};
        for (const rec of recs) {
          const ticker = tickerById[String(rec.asset_id)];
          if (!ticker) continue;
          next[ticker] = {
            ticker,
            rank: num(rec.rank),
            confidenceScore: num(rec.confidence_score),
            convergenceState: (rec.convergence_state as ConvergenceState | undefined) ?? null,
            signalStrength: num(rec.signal_strength),
            quantLean: num(rec.quant_lean),
            sentLean: num(rec.sent_lean),
            profileFit: num(rec.profile_fit),
            dataSufficiency: num(rec.data_sufficiency),
            momentumPctile: num(rec.momentum_pctile),
            riskAdjPctile: num(rec.risk_adj_pctile),
            stabilityPctile: num(rec.stability_pctile),
            beta: num(rec.beta),
            betaBand: (rec.beta_band as string | undefined) ?? null,
            sharpe: num(rec.sharpe_ratio),
            reasoningTrace: (rec.reasoning_trace as string | undefined) ?? null,
          };
        }
        setReadings(next);
        setRunSize(count ?? null);
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading the comparison:", e);
        setError("Unable to load your analysis for these stocks.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [key, profile?.id]);

  return { assets, readings, runSize, runDate, hasRun, isLoading, error };
}

/** The user's watched tickers, most recently added first: the start state's
 *  suggestions and the top group of the browse list. Quiet on failure, since both
 *  are conveniences and the search box works without them. */
export function useWatchedTickers() {
  const { profile } = useAuthStore();
  const [tickers, setTickers] = useState<string[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    supabase
      .from("user_watchlist_assets")
      .select("ticker, created_at, assets(ticker)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setTickers(data.map(watchlistTicker).filter((t, i, all) => t && all.indexOf(t) === i));
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return tickers;
}

/**
 * Which of the compared stocks the reader follows, and a way to follow one.
 *
 * Following is what puts a stock into the reader's next analysis run: the nightly
 * batch reads the watchlist on the server, and the interactive run sends it from
 * the browser. So a stock the Your analysis tab has nothing on can be one click
 * from having something, which is the only useful thing to offer there.
 */
export function useCompareWatchlist(tickers: string[]) {
  const { profile } = useAuthStore();
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = tickers.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (!profile?.id || !list.length) {
      setWatched(new Set());
      return;
    }
    let cancelled = false;
    // The whole (small) watchlist, matched here rather than filtered by ticker in
    // the query, because a row may carry only its asset link.
    supabase
      .from("user_watchlist_assets")
      .select("ticker, assets(ticker)")
      .eq("user_id", profile.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setWatched(new Set(data.map(watchlistTicker).filter((t) => list.includes(t))));
      });
    return () => {
      cancelled = true;
    };
  }, [key, profile?.id]);

  const add = useCallback(
    async (ticker: string, assetId: string) => {
      if (!profile?.id) return;
      setAdding(ticker);
      setError(null);
      const { error: insertError } = await supabase
        .from("user_watchlist_assets")
        .insert({ user_id: profile.id, ticker, asset_id: assetId });
      // 23505 is the unique (user, asset) row already being there: the state we
      // wanted, reached from another tab or an earlier click.
      if (insertError && insertError.code !== "23505") {
        console.error("Error adding to the watchlist:", insertError);
        setError(ticker);
      } else {
        setWatched((prev) => new Set(prev).add(ticker));
      }
      setAdding(null);
    },
    [profile?.id],
  );

  return { watched, adding, error, add };
}
