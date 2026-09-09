// Day keys shared by the trend chart and the posts listed under it.
//
// A "day" here is the calendar day a post was written, in UTC, formatted
// "YYYY-MM-DD". That is the same key the backend buckets rows under, which is what
// lets a bar on the chart and the posts beneath it refer to the same thing without
// either side converting. Local time is deliberately not used: it would slide posts
// between buckets for anyone east or west of UTC, and a day's score would stop
// matching the posts shown for it.
//
// The holiday table is keyed by New York local dates. A UTC day key and a New York
// date are both plain calendar labels here, and a market holiday is a whole calendar
// day rather than an instant, so "2026-11-26" means Thanksgiving to both without a
// conversion between them.

import { marketHolidayName } from "../../utils/marketHours";

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// "2026-08-26" -> "26 Aug"
export function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Whether a day key falls on a Saturday or Sunday, in UTC.
//
// Parsed as UTC midnight rather than through the local timezone, for the same reason
// the keys themselves are UTC: `new Date("2026-08-29")` is already UTC, but
// `getDay()` would read it back in local time and shift the answer by a day for
// anyone far enough east or west. `getUTCDay()` keeps the question and the answer in
// the same timezone the bucket was built in.
export function isWeekend(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const day = parsed.getUTCDay();
  return day === 0 || day === 6;
}

/** Why the US market was shut on a day, and what to call it. */
export type MarketClosure = {
  kind: "weekend" | "holiday";
  /** "Saturday", "Thanksgiving", "Independence Day (observed)". */
  name: string;
};

const WEEKEND_NAMES: Record<number, string> = { 0: "Sunday", 6: "Saturday" };

/**
 * Why a day key's column is quiet, or null on a normal trading day.
 *
 * The chart's bars already washed weekends out, which answered "why is Saturday
 * empty" but not "why is this Thursday in November empty". A holiday looks exactly
 * like a collapse in interest otherwise, which is the same misreading the weekend
 * band was added to prevent.
 *
 * Holiday is checked first. NYSE holidays falling at a weekend are observed on a
 * neighbouring weekday so the two cannot collide in the table as written, but if a
 * future entry ever did, the holiday is the more informative of the two answers.
 *
 * Years outside the holiday table return null for holidays rather than guessing;
 * `holidaysKnownFor` is how a caller tells "trading day" from "we do not know".
 */
export function marketClosure(date: string): MarketClosure | null {
  const holiday = marketHolidayName(date);
  if (holiday) return { kind: "holiday", name: holiday };

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const weekendName = WEEKEND_NAMES[parsed.getUTCDay()];
  return weekendName ? { kind: "weekend", name: weekendName } : null;
}

// The same, but naming the day when it is one the reader thinks of by name.
export function dayLabel(date: string): string {
  if (date === todayKey()) return "Today";
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (date === yesterday) return "Yesterday";
  // Everything else gets a date rather than a weekday name. A weekday read faster
  // while the window was five trading days, because each name appeared once. Over
  // seven consecutive days both ends are the same weekday, so "Monday" would name two
  // different bars on the same chart.
  return formatDay(date);
}
