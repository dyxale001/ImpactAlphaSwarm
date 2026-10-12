import { useEffect, useState } from "react";
import { responseCache } from "../utils/responseCache";

type Answer<T> = { key: string; value: T | null; error: string | null };

// One read-only research request, served from the shared response cache.
//
// A stored answer is read during render, which is what stops a tab already read
// flashing a skeleton on the way back. Once it is past its freshness window the effect
// asks again in the background and the new answer replaces it without a loading state.
// Only a first read, with nothing stored, shows loading.
//
// A failed background refresh is logged and otherwise ignored: the stored answer is
// still the best thing to show. A failed first read reports `errorMessage`.
//
// `key` must name everything the fetcher reads (the endpoint and its arguments), since
// the request is made again only when the key changes. Null means "nothing to ask".
export function useCachedFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  freshFor: (value: T) => number,
  errorMessage: string,
) {
  const stored = key ? responseCache.get<T>(key) : undefined;
  // The latest answer, tagged with the key it answers, so a new ticker or horizon can
  // never show the previous one's answer, not even for the render before the effect.
  const [answer, setAnswer] = useState<Answer<T> | null>(null);

  useEffect(() => {
    if (!key) return;
    const hit = responseCache.get<T>(key);
    if (hit?.fresh) return;

    let cancelled = false;
    responseCache
      .load(key, fetcher, freshFor)
      .then((value) => {
        if (!cancelled) setAnswer({ key, value, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(`Error fetching ${key}:`, e);
        if (!hit) setAnswer({ key, value: null, error: errorMessage });
      });

    return () => {
      cancelled = true;
    };
    // The key names everything the fetcher reads, so a fresh closure under the same
    // key asks for the same thing and must not re-run the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { data: null, isLoading: false, error: null };
  // The store always holds the latest kept answer, and the answer above has just
  // re-rendered to read it. Falling through to `answer` covers one the cache chose not
  // to keep, such as an empty paragraph, and a first read that failed.
  if (stored) return { data: stored.value, isLoading: false, error: null };
  if (answer?.key === key) {
    return { data: answer.value, isLoading: false, error: answer.error };
  }
  return { data: null, isLoading: true, error: null };
}
