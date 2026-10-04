// Pure helpers for the Market News page, kept out of the components so the rules
// that decide what a reader sees can be tested without rendering anything.

import type { MacroArticle } from "../services/api/macroNews";

export interface ProbabilityRow {
  label: string;
  /** Null when the story has no score for this row. */
  p: number | null;
  tagged: boolean;
  marketWide: boolean;
}

/** Every probability on a story, market-wide included, highest first.
 *
 * Unscored rows sink to the bottom rather than vanishing: the point of the page is
 * that nothing is hidden, and a missing number is itself worth seeing. */
export function probabilityRows(
  article: MacroArticle,
  universes: string[],
  marketWideLabel: string,
): ProbabilityRow[] {
  const rows: ProbabilityRow[] = [
    {
      label: marketWideLabel,
      p: article.market_wide,
      tagged: article.tags.includes(marketWideLabel),
      marketWide: true,
    },
    ...universes.map((u) => ({
      label: u,
      p: article.universes[u] ?? null,
      tagged: article.tags.includes(u),
      marketWide: false,
    })),
  ];
  return rows.sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
}

/** Short names for the score strip, where the full universe name would not fit a
 * cell. The full name is always the cell's accessible label. */
export const SHORT_LABELS: Record<string, string> = {
  "Market-wide": "Market-wide",
  Technology: "Tech",
  "Green Energy": "Green Energy",
  Finance: "Finance",
  "AI & Robotics": "AI & Robotics",
  Healthcare: "Health",
  "Media & Communications": "Media",
};

export function shortLabel(label: string): string {
  return SHORT_LABELS[label] ?? label;
}

/** Splits a story's scores into the cells worth a box and the near-zero rest.
 *
 * Every tagged score gets a cell, and so does anything at or above `floor`; the
 * remainder is listed on one muted line rather than dropped, so all seven numbers
 * stay on the card. Unscored rows count as part of the rest. */
export function splitScores(
  rows: ProbabilityRow[],
  floor = 0.1,
): { cells: ProbabilityRow[]; rest: ProbabilityRow[] } {
  const cells = rows.filter((r) => r.tagged || (r.p !== null && r.p >= floor));
  const rest = rows.filter((r) => !cells.includes(r));
  return { cells, rest };
}

/** The headline without a trailing " - Reuters" (or whichever publisher), which the
 * card already shows above it. */
export function displayHeadline(headline: string, source: string): string {
  const suffix = ` - ${source}`.toLowerCase();
  return headline.toLowerCase().endsWith(suffix) ? headline.slice(0, -suffix.length).trim() : headline;
}

/** Whether a blurb only repeats the headline, as every Reuters item in the feed does:
 * headline "Oil jumps 4% - Reuters", blurb "Oil jumps 4%  Reuters". Compared on words
 * alone, since the punctuation between the two differs. Such a blurb is hidden. */
export function blurbRepeatsHeadline(headline: string, blurb: string, source = ""): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
  const b = words(blurb);
  if (b === "") return true;
  const h = words(displayHeadline(headline, source));
  return h !== "" && b.startsWith(h);
}

/** Stories carrying a tag, or all of them when the filter is null. */
export function filterByTag(articles: MacroArticle[], tag: string | null): MacroArticle[] {
  return tag ? articles.filter((a) => a.tags.includes(tag)) : articles;
}

/** How many stories carry each tag. */
export function tagCounts(articles: MacroArticle[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of articles) for (const t of a.tags) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Stories grouped by the reader's local day, newest day first, newest story first
 * within it, each day labelled "Today", "Yesterday" or a short date. */
export function groupByDay(
  articles: MacroArticle[],
  now: Date = new Date(),
): { key: string; label: string; articles: MacroArticle[] }[] {
  const sorted = [...articles].sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
  );
  const today = localDayKey(now);
  const yesterday = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: { key: string; label: string; articles: MacroArticle[] }[] = [];
  for (const article of sorted) {
    const d = new Date(article.published_at);
    const key = localDayKey(d);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      const label =
        key === today
          ? "Today"
          : key === yesterday
            ? "Yesterday"
            : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      group = { key, label, articles: [] };
      groups.push(group);
    }
    group.articles.push(article);
  }
  return groups;
}

/** 0.82 → "82%". */
export function formatProbability(p: number | null): string {
  return p === null ? "–" : `${Math.round(p * 100)}%`;
}

/** The probability a story carries for one group: a universe, or market-wide. */
export function groupProbability(article: MacroArticle, group: string, marketWideLabel: string): number {
  if (group === marketWideLabel) return article.market_wide ?? 0;
  return article.universes[group] ?? 0;
}

/** A group's tagged stories, most relevant first, newest first on a tie. */
export function storiesFor(
  articles: MacroArticle[],
  group: string,
  marketWideLabel: string,
): MacroArticle[] {
  return articles
    .filter((a) => a.tags.includes(group))
    .sort(
      (a, b) =>
        groupProbability(b, group, marketWideLabel) - groupProbability(a, group, marketWideLabel) ||
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
    );
}

/** The signed-in user's sectors from onboarding, in the feed's order, unknown names
 * dropped. Empty when they chose none, which callers treat as "show every sector". */
export function userSectors(chosen: unknown, universes: string[]): string[] {
  if (!Array.isArray(chosen)) return [];
  const picked = new Set(chosen.filter((c): c is string => typeof c === "string"));
  return universes.filter((u) => picked.has(u));
}

/** "Today 14:00", "Yesterday 09:12", or "Fri 2 Oct" for anything older. */
export function shortWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Yesterday ${time}`;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
