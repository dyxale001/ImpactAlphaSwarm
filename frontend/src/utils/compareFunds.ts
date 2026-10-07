// Pure logic behind the fund side of the Compare page.
//
// Everything here works on figures transcribed from the managers' own fact
// sheets, so the rules are about not comparing unlike things: only the return
// periods every fund reports, a warning when the sheets are from different
// months, costs as one year on a round amount with no growth assumed (D-225),
// and holdings compared by name rather than by a weight the sheets print
// differently.

/** The periods a fact sheet's performance table can carry, shortest first.
 *  "inception" is left out on purpose: each fund's starts on a different day, so
 *  two "since inception" figures are never like for like. */
export const PERIOD_ORDER = ["1y", "3y", "5y", "10y"] as const;
export type Period = (typeof PERIOD_ORDER)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  "1y": "1 year",
  "3y": "3 years",
  "5y": "5 years",
  "10y": "10 years",
};

/** Periods every fund reports, in order. A fund with no table at all leaves none. */
export function commonPeriods(performances: Array<Record<string, number> | null | undefined>): Period[] {
  if (!performances.length) return [];
  return PERIOD_ORDER.filter((period) =>
    performances.every((perf) => perf && typeof perf[period] === "number" && !Number.isNaN(perf[period])),
  );
}

/** Periods at least one fund reports and at least one does not: shown as a note so
 *  a missing row is explained rather than silently absent. */
export function partialPeriods(performances: Array<Record<string, number> | null | undefined>): Period[] {
  const common = new Set(commonPeriods(performances));
  return PERIOD_ORDER.filter(
    (period) => !common.has(period) && performances.some((perf) => perf && typeof perf[period] === "number"),
  );
}

/** Sheets further apart than this get the warning banner. */
export const DATE_GAP_WARN_DAYS = 31;

function dayNumber(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Days between the oldest and newest fact sheet, or null when a date is missing. */
export function daysApart(dates: Array<string | null | undefined>): number | null {
  const days: number[] = [];
  for (const d of dates) {
    const n = d ? dayNumber(d) : null;
    if (n === null) return null;
    days.push(n);
  }
  if (days.length < 2) return null;
  return Math.round(Math.max(...days) - Math.min(...days));
}

/** The amount the cost line is shown on. A round number a beginner can picture. */
export const COST_EXAMPLE_RAND = 10_000;

/** What a yearly cost of `pct` percent comes to on the example amount, in whole
 *  rand, for one year, with no growth assumed. */
export function yearlyCost(pct: number | null | undefined, amount = COST_EXAMPLE_RAND): number | null {
  if (pct === null || pct === undefined || Number.isNaN(pct) || pct < 0) return null;
  return Math.round((amount * pct) / 100);
}

// Words a holding's name carries on one sheet and not another: "Apple Inc" and
// "APPLE INC." and "Apple" are one company.
const NAME_NOISE =
  /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|holdings?|group|sa|nv|ag|se|the|class [a-z]|cl [a-z]|ord|ordinary|shares?)\b/g;

export function normaliseHolding(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SharedHoldings {
  /** How many of the shortest list's holdings appear in every list. */
  shared: number;
  /** The length of the shortest list: "8 of the top 10". */
  of: number;
}

/** Holdings every fund's top list has in common, compared by cleaned name. Null
 *  when any fund has no list, because "none in common" would be a false reading
 *  of "not transcribed". */
export function sharedHoldings(lists: Array<Record<string, number> | null | undefined>): SharedHoldings | null {
  if (lists.length < 2) return null;
  const sets: Set<string>[] = [];
  for (const list of lists) {
    const names = list ? Object.keys(list).map(normaliseHolding).filter(Boolean) : [];
    if (!names.length) return null;
    sets.push(new Set(names));
  }
  const smallest = sets.reduce((a, b) => (b.size < a.size ? b : a));
  let shared = 0;
  for (const name of smallest) {
    if (sets.every((s) => s.has(name))) shared += 1;
  }
  return { shared, of: smallest.size };
}

/** The cheapest and dearest yearly cost in the set, when every fund has one. */
export function costRange(ters: Array<number | null | undefined>): { low: number; high: number } | null {
  const values: number[] = [];
  for (const t of ters) {
    if (t === null || t === undefined || Number.isNaN(t)) return null;
    values.push(t);
  }
  if (values.length < 2) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

// ── the written comparison, templated ───────────────────────────────────────

/** What the fund paragraph and the differs-most choice read from each fund. */
export interface FundFacts {
  code: string;
  benchmark: string | null;
  indexTracker: boolean;
  category: string | null;
  riskLevel: number | null;
  ter: number | null;
  performance: Record<string, number> | null;
  asOf: string | null;
}

function pct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/**
 * "What separates these" for funds, built by a fixed template from the fact
 * sheets. Templated rather than written by a model for the same reason the fund
 * page's own explanation is: the facts are few and structured, and a template
 * says them faithfully (D-210's "no black boxing" sits right beside this).
 *
 * Says what is the same before what differs, because for funds that is usually
 * the story: three trackers of one index differ mainly in what they cost.
 */
export function fundsSummary(funds: FundFacts[], shared: SharedHoldings | null): string | null {
  if (funds.length < 2) return null;
  const n = funds.length === 2 ? "Both" : "All three";
  const out: string[] = [];

  const benchmarks = funds.map((f) => f.benchmark?.trim() || null);
  const categories = funds.map((f) => f.category);
  if (funds.every((f) => f.indexTracker) && benchmarks[0] && benchmarks.every((b) => b === benchmarks[0])) {
    out.push(`${n} track the same index, ${benchmarks[0]}.`);
  } else if (categories[0] && categories.every((c) => c === categories[0])) {
    out.push(`${n} sit in the same ASISA category, ${categories[0]}.`);
  }

  if (shared && shared.of > 0) {
    out.push(
      shared.shared === shared.of
        ? "Their largest holdings are the same companies, so they will tend to move together."
        : `${shared.shared} of the ${shared.of} largest holdings appear in every one of them.`,
    );
  }

  const risks = funds.map((f) => f.riskLevel);
  if (risks.every((r): r is number => r !== null)) {
    const low = Math.min(...risks);
    const high = Math.max(...risks);
    out.push(
      low === high
        ? `Each carries a risk rating of ${low} out of 5 on its own fact sheet.`
        : `Their fact sheets rate risk from ${low} to ${high} out of 5.`,
    );
  }

  const range = costRange(funds.map((f) => f.ter));
  if (range) {
    out.push(
      range.low === range.high
        ? `They cost the same each year, ${pct(range.low)} (TER), which is R${yearlyCost(range.low)} a year on R10,000.`
        : `Their yearly costs (TER) run from ${pct(range.low)} to ${pct(range.high)}, which on R10,000 is R${yearlyCost(range.low)} to R${yearlyCost(range.high)} a year.`,
    );
  }

  const gap = daysApart(funds.map((f) => f.asOf));
  if (gap !== null && gap > DATE_GAP_WARN_DAYS) {
    out.push(`Their fact sheets are ${gap} days apart, so their figures end on different dates.`);
  }

  out.push("These are each manager's published figures, set side by side; they do not rank the funds.");
  return out.join(" ");
}

export type FundRow = "ter" | "risk" | "return1y";

const FUND_GAP_SCALES: Record<FundRow, number> = { ter: 0.5, risk: 2, return1y: 10 };

/** The fund row that differs most against its own scale, or null when none differs
 *  by at least a quarter of it. */
export function fundDiffersMost(funds: FundFacts[]): FundRow | null {
  const read: Record<FundRow, (f: FundFacts) => number | null | undefined> = {
    ter: (f) => f.ter,
    risk: (f) => f.riskLevel,
    return1y: (f) => f.performance?.["1y"],
  };
  let best: FundRow | null = null;
  let bestRatio = 0.25;
  for (const row of Object.keys(FUND_GAP_SCALES) as FundRow[]) {
    const values = funds.map(read[row]);
    if (values.some((v) => v === null || v === undefined || Number.isNaN(v))) continue;
    const nums = values as number[];
    const ratio = (Math.max(...nums) - Math.min(...nums)) / FUND_GAP_SCALES[row];
    if (ratio > bestRatio) {
      best = row;
      bestRatio = ratio;
    }
  }
  return best;
}
