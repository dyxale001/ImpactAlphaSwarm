// Is the US market open right now, and what time is it where it trades?
//
// Every question here is asked in New York wall-clock time, never in the reader's own
// and never in UTC. Most of this app's users are in South Africa, so "is it open" asked
// locally is off by six or seven hours, and asked in UTC it is right for half the year
// and an hour wrong for the other half.
//
// The timezone conversion is done by Intl rather than by adding an offset, because the
// offset is the thing that changes: New York is UTC-5 in winter and UTC-4 in summer, and
// the two countries' clock changes are weeks apart. `Intl.DateTimeFormat` with an
// explicit `timeZone` knows the rules and the transition dates; arithmetic on a fixed
// offset silently goes an hour wrong twice a year, which is exactly the failure the
// intraday tick's scheduler timezone was set to avoid.

/** NYSE regular session, in New York local time. */
const OPEN_MINUTES = 9 * 60 + 30; // 09:30
const CLOSE_MINUTES = 16 * 60; // 16:00
/** Half days finish here instead. */
const EARLY_CLOSE_MINUTES = 13 * 60; // 13:00

// Days the NYSE does not trade at all, as YYYY-MM-DD in New York local time.
//
// Hardcoded because there is no free holiday feed worth a network call for this, and a
// pill that reads "Market open" at eleven on Christmas morning is worse than one that is
// occasionally conservative. Weekends are computed, not listed.
//
// This table has to be extended. `holidaysKnownFor` below reports whether the year being
// asked about is covered, and `marketStatus` degrades to weekends-and-hours only when it
// is not, rather than quietly asserting that an unlisted year has no holidays.
//
// Verify against nyse.com/markets/hours-calendars when extending.
//
// Keyed by date to its name rather than a bare list of dates: the names used to live in
// the comments, where nothing could read them. The sentiment trend chart labels a shut
// column with the holiday it is shut for, and `marketStatus` names it in the pill's
// title, so the name is now data. An "(observed)" suffix is kept because it is the
// honest answer to "why is the market shut on the 3rd of July".
const FULL_CLOSURES: Record<number, Record<string, string>> = {
  2026: {
    "2026-01-01": "New Year's Day",
    "2026-01-19": "Martin Luther King Jr. Day",
    "2026-02-16": "Washington's Birthday",
    "2026-04-03": "Good Friday",
    "2026-05-25": "Memorial Day",
    "2026-06-19": "Juneteenth",
    // The 4th is a Saturday.
    "2026-07-03": "Independence Day (observed)",
    "2026-09-07": "Labor Day",
    "2026-11-26": "Thanksgiving",
    "2026-12-25": "Christmas",
  },
  2027: {
    "2027-01-01": "New Year's Day",
    "2027-01-18": "Martin Luther King Jr. Day",
    "2027-02-15": "Washington's Birthday",
    "2027-03-26": "Good Friday",
    "2027-05-31": "Memorial Day",
    // The 19th is a Saturday.
    "2027-06-18": "Juneteenth (observed)",
    // The 4th is a Sunday.
    "2027-07-05": "Independence Day (observed)",
    "2027-09-06": "Labor Day",
    "2027-11-25": "Thanksgiving",
    // The 25th is a Saturday.
    "2027-12-24": "Christmas (observed)",
  },
};

/**
 * The name of the NYSE holiday closing this day, or null if it trades.
 *
 * Takes a "YYYY-MM-DD" New York date. Null covers three different cases on purpose --
 * an ordinary trading day, a weekend (which is computed, never listed) and a year the
 * table does not reach -- because every caller wants the same thing from all three:
 * no holiday name to show. Ask `holidaysKnownFor` to tell the last case apart.
 */
export function marketHolidayName(day: string): string | null {
  return FULL_CLOSURES[Number(day.slice(0, 4))]?.[day] ?? null;
}

// Days the session ends at 13:00 instead of 16:00.
const EARLY_CLOSES: Record<number, string[]> = {
  2026: [
    "2026-11-27", // day after Thanksgiving
    "2026-12-24", // Christmas Eve
  ],
  2027: [
    "2027-11-26", // day after Thanksgiving
  ],
};

export interface NewYorkNow {
  /** "YYYY-MM-DD" in New York. */
  day: string;
  /** "HH:MM", 24 hour, in New York. */
  time: string;
  /** Minutes since New York midnight. */
  minutes: number;
  /** 0 = Sunday. */
  weekday: number;
  /** "EST" or "EDT", whichever is in force. */
  zone: string;
}

const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  // h23 rather than hour12:false: some engines render midnight as "24" under the
  // latter, which would put the clock an entire day out for one hour every night.
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  timeZoneName: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** The current New York wall clock, broken into the pieces everything else needs. */
export function newYorkNow(now: Date = new Date()): NewYorkNow {
  const parts: Record<string, string> = {};
  for (const part of PARTS_FORMAT.formatToParts(now)) {
    parts[part.type] = part.value;
  }

  const hour = Number(parts.hour ?? "0");
  const minute = Number(parts.minute ?? "0");

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minutes: hour * 60 + minute,
    weekday: WEEKDAY_INDEX[parts.weekday ?? ""] ?? 0,
    zone: parts.timeZoneName ?? "ET",
  };
}

/** Whether the holiday table covers the year this day falls in. */
export function holidaysKnownFor(day: string): boolean {
  return FULL_CLOSURES[Number(day.slice(0, 4))] !== undefined;
}

export type ClosedReason =
  | "open"
  | "weekend"
  | "holiday"
  | "before-open"
  | "after-close";

export interface MarketStatus {
  isOpen: boolean;
  /** The pill's text. */
  label: string;
  /** The longer explanation, for the pill's title. */
  detail: string;
  reason: ClosedReason;
  /** True on a half day, whether or not the market is open at this moment. */
  isEarlyClose: boolean;
  /**
   * False once the calendar runs past the hardcoded holiday table. An "open" verdict is
   * then only as good as "it is a weekday inside trading hours", which is right about
   * 96% of days and wrong on Christmas morning.
   */
  holidaysKnown: boolean;
}

/**
 * Whether the NYSE is trading at this instant.
 *
 * Deliberately says "closed" rather than distinguishing pre-market and after-hours.
 * Extended-hours trading exists, but nothing in this app quotes it, and a pill reading
 * "Pre-market" beside a price that is yesterday's close would imply the number moves
 * with it.
 */
export function marketStatus(now: Date = new Date()): MarketStatus {
  const ny = newYorkNow(now);
  const year = Number(ny.day.slice(0, 4));
  const isEarlyClose = (EARLY_CLOSES[year] ?? []).includes(ny.day);
  const closesAt = isEarlyClose ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
  const holidaysKnown = holidaysKnownFor(ny.day);

  const closed = (reason: ClosedReason, detail: string): MarketStatus => ({
    isOpen: false,
    label: "Market closed",
    detail,
    reason,
    isEarlyClose,
    holidaysKnown,
  });

  if (ny.weekday === 0 || ny.weekday === 6) {
    return closed("weekend", "The New York Stock Exchange does not trade at weekends.");
  }

  const holiday = marketHolidayName(ny.day);
  if (holiday) {
    return closed("holiday", `The New York Stock Exchange is shut for ${holiday}.`);
  }

  if (ny.minutes < OPEN_MINUTES) {
    return closed(
      "before-open",
      `Trading opens at 09:30 ${ny.zone}. It is ${ny.time} in New York.`,
    );
  }

  if (ny.minutes >= closesAt) {
    return closed(
      "after-close",
      isEarlyClose
        ? `Trading closed early at 13:00 ${ny.zone} for a half day.`
        : `Trading closed at 16:00 ${ny.zone}. It is ${ny.time} in New York.`,
    );
  }

  const until = isEarlyClose
    ? `Trading until 13:00 ${ny.zone}, a half day.`
    : `Trading until 16:00 ${ny.zone}.`;

  return {
    isOpen: true,
    label: "Market open",
    // The caveat rides on the "open" verdict only. "Closed" needs no hedge: a weekend or
    // an out-of-hours reading is right whether or not the day is also a holiday, and an
    // unlisted holiday can only ever turn a wrong "open" into a right "closed".
    detail: holidaysKnown
      ? until
      : `${until} Public holidays are not known for ${year}, so this assumes it is a normal trading day.`,
    reason: "open",
    isEarlyClose,
    holidaysKnown,
  };
}
