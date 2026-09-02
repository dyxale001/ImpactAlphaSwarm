import type { NewsArticle } from "./NewsArticles";
import type { SentimentHistoryPoint } from "../../services/api/analysis";

// Per-day news, derived on the client from the article list the run already wrote.
//
// There is no stored daily news history the way there is for social. What makes this
// possible anyway is that ai_recommendation.news_articles is uncapped (social_posts is
// capped at five, news is not), so every article that fed the news score is present
// with its own date, sentiment_score, tier and influence. The news lookback and the
// social chart window are both seven days, so bucketing those articles by date lines
// up exactly with the days the chart already plots.
//
// WHAT THIS IS NOT: the news sub-score, per day. The headline news number applies
// fixed cross-tier shares across the whole window and decays on a two day half-life,
// neither of which is a per-day quantity, so these values will not add back up to it.
// This is "how positive that day's coverage read", weighted by how much each article
// matters. The card labels it as its own series for that reason, and the blended score
// is still the stored one, never rebuilt from here.

export type NewsDay = {
  date: string;
  /** 0-100, or null on a day with no articles. Null is a gap in coverage, not a
   *  sentiment of zero. */
  score: number | null;
  /** The day's real article total, which is not the same as how many are carried in
   *  `articles`: a stored day keeps only its most influential few, so counting the
   *  list would under-report a busy day to the tooltip. */
  count: number;
  /** That day's articles, most influential first. */
  articles: NewsArticle[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Influence already folds in both the article's tier share and its recency, and it is
// the number shown on each row, so weighting by it keeps the line consistent with what
// the reader can see. Rows written before influence existed carry none, and for those
// an equal-weight mean is the only thing available: better than dropping the day, and
// the alternative is a gap that would read as "no coverage" when there was some.
function weightedScore(articles: NewsArticle[]): number | null {
  const scored = articles.filter((a) => typeof a.sentiment_score === "number");
  if (scored.length === 0) return null;

  const totalInfluence = scored.reduce((sum, a) => sum + (a.influence ?? 0), 0);
  if (totalInfluence > 0) {
    const weighted = scored.reduce(
      (sum, a) => sum + (a.sentiment_score as number) * (a.influence ?? 0),
      0,
    );
    return weighted / totalInfluence;
  }
  return (
    scored.reduce((sum, a) => sum + (a.sentiment_score as number), 0) /
    scored.length
  );
}

// Group articles by their publication day, keyed by the same YYYY-MM-DD string the
// history points use so the two join without any date parsing. Articles whose date is
// missing or malformed are dropped rather than bucketed under a guess: a wrong day
// would move a line the reader is being invited to click through.
export function newsDayIndex(
  articles: NewsArticle[] | null | undefined,
): Map<string, NewsDay> {
  const byDate = new Map<string, NewsArticle[]>();

  for (const article of articles ?? []) {
    const date = (article.date ?? "").slice(0, 10);
    if (!ISO_DAY.test(date)) continue;
    const bucket = byDate.get(date);
    if (bucket) bucket.push(article);
    else byDate.set(date, [article]);
  }

  const index = new Map<string, NewsDay>();
  for (const [date, dayArticles] of byDate) {
    const sorted = [...dayArticles].sort(
      (a, b) => (b.influence ?? -1) - (a.influence ?? -1),
    );
    index.set(date, {
      date,
      score: weightedScore(sorted),
      count: sorted.length,
      articles: sorted,
    });
  }
  return index;
}

// The same index, read off history the backend stored rather than rebuilt here.
//
// This is the one to prefer wherever it is available. Everything in the derivation
// above is a workaround for there being no stored history: it weights by an influence
// figure computed across the whole window, it is recomputed from whatever the newest
// run happened to fetch, and it cannot reach further back than the news lookback. A
// stored day is tier-weighted properly, fixed once written, and retained past the
// window. See backend/src/utils/ns_daily.py and migrations/021.
//
// Returns an empty index when the points carry no news, which is what a deployment
// with NEWS_HISTORY_ENABLED off looks like, and is the caller's signal to fall back.
export function newsDaysFromHistory(
  points: SentimentHistoryPoint[] | null | undefined,
): Map<string, NewsDay> {
  const index = new Map<string, NewsDay>();
  for (const point of points ?? []) {
    // Undefined means this deployment stores no news history at all; null on a present
    // field means this day had no coverage, and that is a real day worth keeping so the
    // chart can gap it rather than skip it.
    if (point.news_count === undefined) continue;
    index.set(point.date, {
      date: point.date,
      score: point.news_score ?? null,
      count: point.news_count,
      articles: point.top_articles ?? [],
    });
  }
  return index;
}

// How many days in the index actually carry a plottable score. The chart uses this the
// same way it uses daysWithData for social: a line needs a few real days before it says
// anything.
export function newsDaysWithData(index: Map<string, NewsDay>): number {
  let count = 0;
  for (const day of index.values()) if (day.score !== null) count += 1;
  return count;
}
