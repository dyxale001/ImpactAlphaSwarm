import { useEffect, useState } from "react";
import {
  getCatalogueFund,
  type CatalogueFundDetail,
} from "../services/api/fundCatalogue";
import { UploadApiError, getUploadedFund } from "../services/api/fundUploads";
import { asCatalogueDetail, uploadIdOf } from "../utils/fundUploads";
import { LOAD_FAILED } from "../utils/fundsCopy";

// Each picked fund's detail: its identity and newest fact sheet, from the same
// endpoint its own page reads, so a figure here is the figure there. A reader's
// own uploaded fund ("mine-<id>") comes from the upload endpoint, in the same
// shape, so the comparison grid reads every column alike.
//
// Loaded together and cached for the life of the page, so removing a fund and
// adding it back, or reordering, never asks again for a sheet already read.

const cache = new Map<string, CatalogueFundDetail>();

async function load(id: string): Promise<CatalogueFundDetail> {
  const upload = uploadIdOf(id);
  if (!upload) return getCatalogueFund(id);
  try {
    return asCatalogueDetail(await getUploadedFund(upload, LOAD_FAILED));
  } catch (e) {
    // Removed, or not this reader's: the same "not found" a retired catalogue
    // fund gives, so the page drops it with its note.
    if (e instanceof UploadApiError && e.status === 404) throw new Error("Fund not found");
    throw e;
  }
}

export function useCompareFunds(ids: string[]) {
  const [funds, setFunds] = useState<Record<string, CatalogueFundDetail>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    let cancelled = false;

    async function run() {
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
              cache.set(id, await load(id));
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

    run();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { funds, missing, isLoading, error };
}
