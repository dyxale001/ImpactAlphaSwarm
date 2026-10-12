import { useCallback, useEffect, useRef, useState } from "react";
import {
  explainComparison,
  explainFundComparison,
  getSavedComparison,
  getSavedFundComparison,
  type ComparisonTraceResponse,
} from "../services/api/compare";
import type { QuantHorizon } from "../data/quantExplainers";
import { explainComparisonWithUploads } from "../services/api/fundUploads";
import { uploadIdOf } from "../utils/fundUploads";

// The written comparison over the picked stocks or funds: personal, and written on
// request. Stocks are keyed on the price window as well; funds have none.
//
// On settling, the page asks whether the reader already has a current paragraph for
// this set and window (free, never a model call). If not, the panel offers the
// button, and `explain` writes one.
//
// Asked only once a comparison has actually been made: two or more stocks, and the
// selection has stopped changing for a moment. Cached here by the sorted set, the
// same key the server uses, so reordering the columns or switching window and back
// never asks again for what the page already has.

const SETTLE_MS = 600;

export type TraceKind = "stocks" | "funds";

/** A set holding one of the reader's uploaded funds is never stored, so there
 *  is no saved paragraph to ask for: the panel opens on its button. */
function nothingSaved(ids: string[]): Promise<ComparisonTraceResponse> {
  return Promise.resolve({
    fund_ids: ids,
    horizon: "FUNDS",
    available: true,
    trace: null,
    source: null,
    model: null,
    generated_at: null,
    personal: false,
    run_at: null,
  });
}

function fetchers(kind: TraceKind, horizon: QuantHorizon | null) {
  return kind === "funds"
    ? {
        // A comparison including an upload is written by the upload endpoint,
        // which can read the reader's own fund; Compare's cannot, by design.
        saved: (ids: string[]) =>
          ids.some((id) => uploadIdOf(id)) ? nothingSaved(ids) : getSavedFundComparison(ids),
        explain: (ids: string[]) =>
          ids.some((id) => uploadIdOf(id)) ? explainComparisonWithUploads(ids) : explainFundComparison(ids),
      }
    : {
        saved: (ids: string[]) => getSavedComparison(ids, horizon ?? "6M"),
        explain: (ids: string[]) => explainComparison(ids, horizon ?? "6M"),
      };
}

export function useComparisonTrace(kind: TraceKind, tickers: string[], horizon: QuantHorizon | null) {
  const [trace, setTrace] = useState<ComparisonTraceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, ComparisonTraceResponse>());

  const ordered = tickers.join(",");
  const key = `${kind}:${[...tickers].sort().join("|")}:${horizon ?? ""}`;
  const ready = tickers.length >= 2;
  // The key the latest answer belongs to, so a slow reply for an old selection
  // never lands on a new one.
  const current = useRef(key);

  useEffect(() => {
    current.current = key;
    setError(null);
    setIsWriting(false);
    if (!ready) {
      setTrace(null);
      setIsLoading(false);
      return;
    }
    const hit = cache.current.get(key);
    if (hit) {
      setTrace(hit);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setTrace(null);
    setIsLoading(true);
    const timer = setTimeout(() => {
      fetchers(kind, horizon)
        .saved(ordered.split(","))
        .then((res) => {
          if (cancelled) return;
          cache.current.set(key, res);
          setTrace(res);
        })
        .catch((e) => {
          if (cancelled) return;
          // Quiet: with no stored paragraph to show, the button is still the way in.
          console.error("Error reading the saved comparison:", e);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, kind, ordered, horizon, ready]);

  const explain = useCallback(() => {
    if (!ready) return;
    const asked = key;
    setIsWriting(true);
    setError(null);
    fetchers(kind, horizon)
      .explain(ordered.split(","))
      .then((res) => {
        cache.current.set(asked, res);
        if (current.current !== asked) return;
        setTrace(res);
        if (res.available && !res.trace) {
          setError("A comparison could not be written for these just now. The rows below still explain each difference.");
        }
      })
      .catch((e) => {
        if (current.current !== asked) return;
        console.error("Error writing the comparison:", e);
        setError("Unable to write the comparison. Try again in a moment.");
      })
      .finally(() => {
        if (current.current === asked) setIsWriting(false);
      });
  }, [key, kind, ordered, horizon, ready]);

  return { trace, isLoading, isWriting, error, explain };
}
