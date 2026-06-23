// The backend runs a scheduled refresh nightly at 22:00 UTC (just after the NYSE
// close). A user's data is considered "stale" when their latest run predates that
// boundary — meaning the nightly job did not refresh them (they fell outside the
// active window). See backend/src/api.py:/api/analysis/run-daily.
export const DAILY_RUN_UTC_HOUR = 22;

/** The most recent moment the nightly scheduled run has fired (at or before now). */
export function lastScheduledRunUTC(now: Date = new Date()): Date {
  const boundary = new Date(now);
  boundary.setUTCHours(DAILY_RUN_UTC_HOUR, 0, 0, 0);
  if (boundary.getTime() > now.getTime()) {
    boundary.setUTCDate(boundary.getUTCDate() - 1);
  }
  return boundary;
}

/** True when the latest run is older than the most recent nightly refresh. */
export function isRunStale(
  latestRunCreatedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!latestRunCreatedAt) return false;
  return new Date(latestRunCreatedAt).getTime() < lastScheduledRunUTC(now).getTime();
}

/** Human-friendly age of a run, e.g. "yesterday", "3 days ago". */
export function describeRunAge(iso: string, now: number = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
