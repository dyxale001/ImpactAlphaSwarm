import { useEffect, useState } from "react";
import {
  getWhaleOverview,
  type WhaleOverviewResponse,
} from "../services/api/analysis";

const EMPTY: WhaleOverviewResponse = {
  feed: [],
  highlights: {
    biggest_buy: null,
    biggest_sell: null,
    most_accumulated: null,
    most_reduced: null,
  },
  counts: {
    companies: 0,
    transactions: 0,
    new_companies: 0,
    companies_with_insider_data: 0,
  },
  new_companies: [],
  fetched_at: null,
};

// Fill in anything the response is missing rather than trusting its shape.
//
// A backend that predates /api/whales/activity serves this path through the
// older /api/whales/{ticker} route instead, which answers 200 with a completely
// different body. Reading .feed off that threw and blanked the whole page, so
// the shape is normalised here once instead of guarded at every use site.
function normalise(raw: Partial<WhaleOverviewResponse> | null): WhaleOverviewResponse {
  return {
    ...EMPTY,
    ...(raw ?? {}),
    feed: Array.isArray(raw?.feed) ? raw.feed : [],
    highlights: { ...EMPTY.highlights, ...(raw?.highlights ?? {}) },
    counts: { ...EMPTY.counts, ...(raw?.counts ?? {}) },
    new_companies: Array.isArray(raw?.new_companies) ? raw.new_companies : [],
  };
}

// Cross-company whale activity for the Whale Watching landing page: the insider
// feed across every tracked company plus the biggest moves. One call, served
// from caches the backend already holds, so it loads without waiting on any
// external API.
export function useWhaleOverview() {
  const [overview, setOverview] = useState<WhaleOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getWhaleOverview();
        if (cancelled) return;
        setOverview(normalise(res));
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading whale overview:", e);
        setError("Unable to load recent activity right now.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { overview, isLoading, error };
}
