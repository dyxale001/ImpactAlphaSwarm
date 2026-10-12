import {
  getInsiderTrace,
  getInstitutionalTrace,
  type WhaleTraceResponse,
} from "../services/api/analysis";
import { MINUTE } from "../utils/responseCache";
import { useCachedFetch } from "./useCachedFetch";

const FETCHERS = {
  institutions: getInstitutionalTrace,
  insiders: getInsiderTrace,
} as const;

export type WhaleTraceKind = keyof typeof FETCHERS;

// How long a summary is served before it is asked for again in the background. The
// server rewrites one only when a new filing arrives, at most nightly, so this is about
// a tab left open overnight rather than a reader switching tabs. A template paragraph
// gets the same window: the server only tries the model again a day after writing it
// (TEMPLATE_RETRY), so asking sooner would read back the same template.
const SUMMARY_FRESH_MS = 30 * MINUTE;

function freshFor(res: WhaleTraceResponse): number {
  // No paragraph yet: either nothing to describe or a first write still to happen.
  // Not kept, so the next visit asks again.
  if (res.enabled && !res.trace) return 0;
  return SUMMARY_FRESH_MS;
}

// Fetches one whale tab's AI summary. Separate from the tab's own data so the figures
// render straight away; a first read can wait on a model call, and the panel shows its
// own skeleton meanwhile. Cached across tab switches (utils/responseCache).
export function useWhaleTrace(
  ticker: string | undefined,
  kind: WhaleTraceKind,
  enabled = true,
) {
  const key = ticker && enabled ? `whale-trace:${kind}:${ticker.toUpperCase()}` : null;
  const { data, isLoading, error } = useCachedFetch(
    key,
    () => FETCHERS[kind](ticker as string),
    freshFor,
    "The written summary could not be loaded.",
  );
  return { trace: data, isLoading, error };
}
