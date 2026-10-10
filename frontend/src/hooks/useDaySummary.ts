import { useState, useEffect } from "react";
import { getDayDrivers, type DaySummaryResponse } from "../services/api/analysis";

// Fetches the generated paragraph for one day of the trend chart, "What's driving the
// sentiment". Kept generic over the request it makes, since the retired day summary
// was served the same way and any future day paragraph will be too.
//
// Generation is lazy on the server: the first request for a day pays for a short
// completion, every request after that is an indexed read. This hook adds the other
// half of that bargain, which is not asking twice for something that cannot change.
//
// Only a SETTLED paragraph is cached, because only a settled one is final. A paragraph
// for today is rewritten on the server as articles arrive, and an empty answer can mean
// a generation that failed or a day whose news has not landed yet; caching either would
// pin the panel to it for the rest of the visit. Those are asked again on the next
// click, which costs an indexed read.
//
// Module level rather than per component, so a settled day survives navigating away
// and back. Read during render, which is what stops a day already read flashing a
// skeleton on the way back to text it already has.
const settled = new Map<string, DaySummaryResponse>();

type Answer = {
  key: string;
  summary: DaySummaryResponse | null;
  error: string | null;
};

function useDayParagraph(
  kind: string,
  ticker: string | undefined,
  day: string | null,
  fetchParagraph: (ticker: string, day: string) => Promise<DaySummaryResponse>,
  errorMessage: string,
) {
  const key = ticker && day ? `${kind}:${ticker}:${day}` : null;
  const cached = key ? settled.get(key) : undefined;
  // The latest answer, tagged with the day it answers. Returned only while that tag
  // matches the day being asked about, so switching days can never show the previous
  // day's paragraph under the new day's heading, not even for the one render before
  // the effect below has run.
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!key || !ticker || !day || settled.has(key)) return;

    let cancelled = false;
    fetchParagraph(ticker, day)
      .then((res) => {
        if (cancelled) return;
        if (res.is_final && res.summary) settled.set(key, res);
        setAnswer({ key, summary: res, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Error fetching day paragraph:", e);
        setAnswer({ key, summary: null, error: errorMessage });
      });

    return () => {
      cancelled = true;
    };
  }, [key, ticker, day, fetchParagraph, errorMessage]);

  if (!key) return { summary: null, isLoading: false, error: null };
  if (cached) return { summary: cached, isLoading: false, error: null };
  if (answer?.key === key) {
    return { summary: answer.summary, isLoading: false, error: answer.error };
  }
  return { summary: null, isLoading: true, error: null };
}

export function useDayDrivers(ticker: string | undefined, day: string | null) {
  return useDayParagraph(
    "drivers",
    ticker,
    day,
    getDayDrivers,
    "Unable to load what drove this day's sentiment.",
  );
}
