import { useState, useEffect } from "react";
import {
  getFundCatalogue,
  getFundCatalogueMeta,
  getFundMatches,
  type CatalogueFilters,
  type CatalogueMeta,
  type CatalogueResponse,
  type FundMatchesResponse,
} from "../services/api/fundCatalogue";
import { LOAD_FAILED, MATCHES_LOAD_FAILED } from "../utils/fundsCopy";

/** The catalogue, reloaded when the filters change. */
export function useFundCatalogue(filters: CatalogueFilters) {
  const [data, setData] = useState<CatalogueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serialised so the effect re-runs on a value change rather than on every
  // render of a freshly built object.
  const key = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getFundCatalogue(JSON.parse(key) as CatalogueFilters);
        if (cancelled) return;
        setData(res);
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading fund catalogue:", e);
        setError(LOAD_FAILED);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { data, funds: data?.funds ?? [], isLoading, error };
}

/** The classification tree, the vehicles and the risk scale. Loaded once. */
export function useFundCatalogueMeta() {
  const [meta, setMeta] = useState<CatalogueMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getFundCatalogueMeta();
        if (cancelled) return;
        setMeta(res);
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading fund catalogue meta:", e);
        setError(LOAD_FAILED);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { meta, isLoading, error };
}

/** The caller's own matches.
 *
 * A failure here is survivable and says so: the browse list below it is the
 * whole catalogue, so the page still does something useful without the matched
 * section.
 */
export function useFundMatches() {
  const [data, setData] = useState<FundMatchesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getFundMatches();
        if (cancelled) return;
        setData(res);
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading fund matches:", e);
        setError(MATCHES_LOAD_FAILED);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    matches: data?.matches ?? [],
    bracket: data?.bracket ?? null,
    profileFound: data?.profile_found ?? false,
    fallbackRiskOnly: data?.fallback_risk_only ?? false,
    notice: data?.notice ?? null,
    sectionTitle: data?.section_title ?? null,
    isLoading,
    error,
  };
}
