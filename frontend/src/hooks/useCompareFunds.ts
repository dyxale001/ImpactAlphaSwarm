import { useEffect, useState } from "react";
import {
  getCatalogueFund,
  type CatalogueFundDetail,
} from "../services/api/fundCatalogue";
import { LOAD_FAILED } from "../utils/fundsCopy";

// Each picked fund's detail: its identity and newest fact sheet, from the same
// endpoint its own page reads, so a figure here is the figure there.
//
// Loaded together and cached for the life of the page, so removing a fund and
// adding it back, or reordering, never asks again for a sheet already read.

const cache = new Map<string, CatalogueFundDetail>();

export function useCompareFunds(ids: string[]) {
  const [funds, setFunds] = useState<Record<string, CatalogueFundDetail>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    let cancelled = false;

    async function load() {
      const todo = list.filter((id) => !cache.has(id));
      if (todo.length) {
        setIsLoading(true);
        setError(null);
      }
      const gone: string[] = [];
      try {
        await Promise.all(
          todo.map(async (id) => {
            try {
              cache.set(id, await getCatalogueFund(id));
            } catch (e) {
              // A retired fund in a shared link: dropped with a note, not a page error.
              if (e instanceof Error && /not found/i.test(e.message)) gone.push(id);
              else throw e;
            }
          }),
        );
      } catch (e) {
        if (!cancelled) {
          console.error("Error loading funds to compare:", e);
          setError(LOAD_FAILED);
        }
      }
      if (cancelled) return;
      const next: Record<string, CatalogueFundDetail> = {};
      for (const id of list) {
        const hit = cache.get(id);
        if (hit) next[id] = hit;
      }
      setFunds(next);
      setMissing(gone);
      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { funds, missing, isLoading, error };
}
