import { useEffect, useState } from "react";
import { getMacroNews, type MacroFeed } from "../services/api/macroNews";

// The Market News feed for the dashboard's news widgets.
//
// Shared: three news widgets on one board make one request, not three. A call in
// flight is reused, and an answer is kept for ten minutes, which is generous for
// a feed that updates three times a day and short enough that a board left open
// all morning picks up the next update.

const TTL_MS = 10 * 60 * 1000;
const FAILED = "Market news could not be loaded just now.";

let cached: { feed: MacroFeed; at: number } | null = null;
let inFlight: Promise<MacroFeed> | null = null;

function loadFeed(): Promise<MacroFeed> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.feed);
  if (!inFlight) {
    inFlight = getMacroNews(7)
      .then((feed) => {
        cached = { feed, at: Date.now() };
        return feed;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useMacroFeed() {
  const fresh = cached && Date.now() - cached.at < TTL_MS ? cached.feed : null;
  const [feed, setFeed] = useState<MacroFeed | null>(fresh);
  const [isLoading, setIsLoading] = useState(!fresh);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFeed()
      .then((f) => {
        if (!cancelled) setFeed(f);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("Error loading market news for the dashboard:", e);
        setError(FAILED);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { feed, isLoading, error };
}
