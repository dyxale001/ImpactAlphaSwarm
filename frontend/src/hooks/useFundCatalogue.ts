import { useState, useEffect } from "react";
import {
  getCatalogueFund,
  getFundCatalogue,
  getFundCatalogueMeta,
  getFundMatches,
  getFundPrices,
  type CatalogueFilters,
  type CatalogueFundDetail,
  type CatalogueMeta,
  type CatalogueResponse,
  type FundMatchesResponse,
  type FundPrices,
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

/** One fund, reloaded when the id in the URL changes.
 *
 * `notFound` is separated from `error` because the two want different pages: an
 * unknown id is a dead link the reader should be sent back from, a failed
 * request is worth retrying.
 */
export function useFundDetail(fundId: string | undefined) {
  const [fund, setFund] = useState<CatalogueFundDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!fundId) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const res = await getCatalogueFund(fundId);
        if (cancelled) return;
        setFund(res);
      } catch (e) {
        if (cancelled) return;
        // A 404 is the expected answer for a link to a fund that has been
        // retired, so it is not logged as a failure.
        if (e instanceof Error && /not found/i.test(e.message)) {
          setNotFound(true);
        } else {
          console.error("Error loading fund:", e);
          setError(LOAD_FAILED);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fundId]);

  return { fund, isLoading, error, notFound };
}

/** One fund's closing prices, for the chart on its page.
 *
 * A failure is silent by design: the chart is the least important thing on a
 * page whose point is the published document, so a price feed being down loses
 * the line and nothing else.
 */
export function useFundPrices(fundId: string | undefined, listed: boolean) {
  const [prices, setPrices] = useState<FundPrices | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Not asked for at all when the fund is not listed: a unit trust has no
    // market price, so the request would be a round trip to learn nothing.
    if (!fundId || !listed) {
      setPrices(null);
      return;
    }

    async function load() {
      setIsLoading(true);
      try {
        const res = await getFundPrices(fundId as string);
        if (!cancelled) setPrices(res);
      } catch (e) {
        if (!cancelled) {
          console.error("Error loading fund prices:", e);
          setPrices(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fundId, listed]);

  return { prices, isLoading };
}

/** The classification tree, the vehicles and the risk scale. Loaded once.
 *
 * `reload` exists because the failure is now shown rather than swallowed: the
 * navigator this feeds is the only way to browse by category, and a page that
 * says "the category list did not load" and offers no way to ask again leaves
 * the reader reloading the whole route to retry one request.
 */
export function useFundCatalogueMeta() {
  const [meta, setMeta] = useState<CatalogueMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
  }, [attempt]);

  return { meta, isLoading, error, reload: () => setAttempt((n) => n + 1) };
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
