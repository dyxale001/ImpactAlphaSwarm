// Pure logic behind the stock side of the Compare page. No React, no fetching,
// so every rule that decides what the page says is tested on its own.
//
// The page's one design rule lives here as much as in the components: it never
// names a winner. Nothing below sorts stocks by a score, colours a value as good
// or bad, or combines rows into an overall reading. It marks where stocks differ
// most and where they are alike, and says what each difference describes.

import type { QuantWindowFacts, SentimentHistoryPoint } from "../services/api/analysis";
import { CONVERGENCE_HEADLINE, type ConvergenceState } from "../data/signalCopy";

// ── the user's own run ───────────────────────────────────────────────────────

/** One stock's row in the user's latest completed run, as the page needs it. */
export interface RunReading {
  ticker: string;
  rank: number | null;
  confidenceScore: number | null;
  convergenceState: ConvergenceState | null;
  signalStrength: number | null;
  quantLean: number | null;
  sentLean: number | null;
  profileFit: number | null;
  dataSufficiency: number | null;
  momentumPctile: number | null;
  riskAdjPctile: number | null;
  stabilityPctile: number | null;
  beta: number | null;
  betaBand: string | null;
  sharpe: number | null;
  reasoningTrace: string | null;
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "a", "a and b", "a, b and c". */
export function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Below this, a lean is described as close to neutral rather than given a
 *  direction. The ranking itself uses the sign alone; saying "leaned favourable"
 *  of a +0.05 reading would claim more than the measurement does. */
export const LEAN_NEUTRAL_BAND = 0.15;

export function leanWord(lean: number | null): string {
  if (lean === null || Number.isNaN(lean)) return "had no reading";
  if (lean >= LEAN_NEUTRAL_BAND) return "leaned favourable";
  if (lean <= -LEAN_NEUTRAL_BAND) return "leaned unfavourable";
  return "were close to neutral";
}

/** A profile fit under this moved the stock down, and is worth saying out loud. */
export const PROFILE_FIT_PENALTY = 0.95;
/** Evidence depth under this was thin enough to move the stock down. */
export const THIN_EVIDENCE = 0.7;

/**
 * "Why your analysis places them differently": the templated answer to the
 * sponsor's question ("Google's RSI is 37 and Apple's is 66 ... but it says that
 * Apple is a better buy. I wonder why", 22/09).
 *
 * Templated rather than written by a model because it is personal: it reads the
 * user's own run, so a model call per user per comparison could never be cached.
 * And because the facts are a handful of stored numbers that a template says
 * faithfully.
 *
 * Stocks are named in the order the user picked them, never sorted by place.
 * Returns null when fewer than two of the stocks are in the run, since there is
 * then nothing to reconcile.
 */
export function explainPlacement(
  readings: RunReading[],
  runSize: number | null,
): string[] | null {
  const placed = readings.filter((r) => r.rank !== null);
  if (placed.length < 2) return null;

  const out: string[] = [];
  const places = placed.map((r) => `${r.ticker} ${ordinal(r.rank as number)}`);
  out.push(
    `Your latest analysis placed ${joinList(places)}${runSize ? ` of ${runSize} stocks` : ""}.`,
  );

  const scored = placed.filter((r) => r.convergenceState !== null);
  if (scored.length >= 2) {
    out.push(
      "Your analysis reads two things for each stock, its price measurements and its news and social tone, and places a stock higher when the two point the same way.",
    );
    for (const r of scored) {
      const state = CONVERGENCE_HEADLINE[r.convergenceState as ConvergenceState].toLowerCase();
      out.push(
        `For ${r.ticker}, the price measurements ${leanWord(r.quantLean)} and the tone ${leanWord(r.sentLean)}, so ${state.replace(/^signals/, "its signals")}.`,
      );
    }

    const penalised = scored.filter((r) => r.profileFit !== null && r.profileFit < PROFILE_FIT_PENALTY);
    if (penalised.length && penalised.length < scored.length) {
      out.push(
        `${joinList(penalised.map((r) => r.ticker))} moved around more than the risk preference you set, which moves a stock down; this reflects your own answers, not a view on the stock.`,
      );
    }
    const thin = scored.filter((r) => r.dataSufficiency !== null && r.dataSufficiency < THIN_EVIDENCE);
    if (thin.length && thin.length < scored.length) {
      out.push(
        `There was less to go on for ${joinList(thin.map((r) => r.ticker))}, fewer articles, posts or days of prices, and a thinner reading is placed lower on purpose.`,
      );
    }
  }

  out.push(
    "RSI is not used to place stocks at all, because a high or a low reading is neither good nor bad in itself. That is how a stock with the higher RSI can be placed lower. None of this says which one to buy.",
  );
  return out;
}

// ── seven days of sentiment ──────────────────────────────────────────────────

export interface WeekTone {
  /** Post-weighted mean of the days that had posts, 0-100, or null. */
  socialScore: number | null;
  posts: number;
  /** Article-weighted mean of the days that had news, 0-100, or null. */
  newsScore: number | null;
  articles: number;
  /** False when this deployment stores no news history at all. */
  hasNews: boolean;
}

function weightedMean(pairs: Array<[number | null | undefined, number]>): number | null {
  let total = 0;
  let weight = 0;
  for (const [value, w] of pairs) {
    if (value === null || value === undefined || Number.isNaN(value) || w <= 0) continue;
    total += value * w;
    weight += w;
  }
  return weight > 0 ? total / weight : null;
}

/** The week in one reading per channel, weighted by how much was said each day so
 *  a day with two posts does not count as much as a day with two hundred. */
export function weekTone(points: SentimentHistoryPoint[]): WeekTone {
  const hasNews = points.some((p) => p.news_score !== undefined);
  return {
    socialScore: weightedMean(points.map((p) => [p.score, p.post_count || 0])),
    posts: points.reduce((n, p) => n + (p.post_count || 0), 0),
    newsScore: hasNews ? weightedMean(points.map((p) => [p.news_score, p.news_count || 0])) : null,
    articles: points.reduce((n, p) => n + (p.news_count || 0), 0),
    hasNews,
  };
}

// ── the rows ─────────────────────────────────────────────────────────────────

/** The rows whose gap can be measured, and the gap that counts as a lot. The
 *  scales are rough "a reader would notice this" sizes, so a 30-point RSI gap and
 *  a 15-point fall gap rank against each other sensibly. */
export const GAP_SCALES = {
  change: 20,
  drawdown: 15,
  volatility: 15,
  rsi: 30,
} as const;

export type MeasuredRow = keyof typeof GAP_SCALES;

/** Within this many units, a row's values are called alike. */
export const ALIKE_WITHIN: Record<MeasuredRow, number> = {
  change: 2,
  drawdown: 2,
  volatility: 3,
  rsi: 5,
};

export function rowValues(row: MeasuredRow, facts: Array<QuantWindowFacts | null>): number[] | null {
  const values: number[] = [];
  for (const f of facts) {
    if (!f) return null;
    const v =
      row === "change"
        ? f.change_pct
        : row === "drawdown"
          ? Math.abs(f.max_drawdown_pct)
          : row === "volatility"
            ? f.volatility_pct
            : f.latest_rsi;
    if (v === null || v === undefined || Number.isNaN(v)) return null;
    values.push(v);
  }
  return values.length >= 2 ? values : null;
}

export function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

export function isAlike(row: MeasuredRow, facts: Array<QuantWindowFacts | null>): boolean {
  const values = rowValues(row, facts);
  return values !== null && spread(values) <= ALIKE_WITHIN[row];
}

/** The row where the stocks differ most, measured against each row's own scale,
 *  or null when nothing differs by at least a quarter of its scale. Marked on the
 *  page with a neutral tag: "differs most" is a fact about the gap, and says
 *  nothing about which side of it is preferable. */
export function differsMost(facts: Array<QuantWindowFacts | null>): MeasuredRow | null {
  let best: MeasuredRow | null = null;
  let bestRatio = 0.25;
  for (const row of Object.keys(GAP_SCALES) as MeasuredRow[]) {
    const values = rowValues(row, facts);
    if (!values) continue;
    const ratio = spread(values) / GAP_SCALES[row];
    if (ratio > bestRatio) {
      best = row;
      bestRatio = ratio;
    }
  }
  return best;
}

// ── the chart ────────────────────────────────────────────────────────────────

export interface Rebasable {
  ticker: string;
  points: Array<{ date: string; close: number }>;
}

/** Every stock's closes as an index starting at 100, merged by date.
 *
 *  Rebased because a R4,000 share and a R300 share on one price axis would draw
 *  the cheaper one flat; starting both at 100 shows the shape of each move, which
 *  is what a side-by-side is for. A date one listing has and another lacks keeps
 *  its gap rather than being filled. */
export function rebaseSeries(series: Rebasable[]): Array<Record<string, number | string>> {
  const rows = new Map<string, Record<string, number | string>>();
  for (const s of series) {
    const first = s.points.find((p) => Number.isFinite(p.close) && p.close > 0);
    if (!first) continue;
    for (const p of s.points) {
      if (!Number.isFinite(p.close)) continue;
      const row = rows.get(p.date) ?? { date: p.date };
      row[s.ticker] = Math.round((p.close / first.close) * 1000) / 10;
      rows.set(p.date, row);
    }
  }
  return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
