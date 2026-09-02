import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { tierMeta } from "./sentimentDisplay";
import SentimentSignals from "./SentimentSignals";
import { dayLabel as formatDayLabel } from "./sentimentDays";
import { NEWS_LOOKBACK_DAYS } from "../../data/sentimentMethodology";

export type NewsArticle = {
  source?: string;
  tier?: number | null;
  date?: string;
  headline?: string;
  url?: string | null;
  sentiment?: string;
  sentiment_score?: number; // 0-100, this article's own text sentiment
  influence?: number; // % of the news score this article drives (tier + recency)
};

// Highest-influence first; items without an influence value sink to the end.
export function sortArticlesByInfluence(
  articles: NewsArticle[],
): NewsArticle[] {
  return [...articles].sort(
    (a, b) => (b.influence ?? -1) - (a.influence ?? -1),
  );
}

export function tierCounts(articles: NewsArticle[]): Record<number, number> {
  return articles.reduce(
    (acc, a) => {
      const t = a.tier === 1 || a.tier === 2 || a.tier === 3 ? a.tier : 0;
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    },
    {} as Record<number, number>,
  );
}

// One news article row, shared by the compact top-5 list on the asset page
// (clamp on) and the full news sentiment page (clamp off).
export function NewsArticleRow({
  article: a,
  clamp = true,
}: {
  article: NewsArticle;
  clamp?: boolean;
}) {
  const t = tierMeta(a.tier);
  const row = (
    <div className={clamp ? "px-3 py-2.5" : "px-4 py-3.5"}>
      <p
        className={`text-sm text-brand-fg ${clamp ? "line-clamp-2" : "leading-relaxed"}`}
      >
        {a.headline || "—"}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-brand-muted-fg">
        <span className="font-mono">{a.date || "—"}</span>
        <span className={`px-1.5 py-0.5 rounded-full font-medium ${t.cls}`}>
          {t.label}
        </span>
        <SentimentSignals score={a.sentiment_score} influence={a.influence} />
        <span className="min-w-0 truncate">{a.source || "—"}</span>
        {a.url && (
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-brand-muted-fg" />
        )}
      </div>
    </div>
  );
  if (!a.url) return row;
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer"
      className="block hover:bg-brand-primary/5 transition-colors"
    >
      {row}
    </a>
  );
}

// How many rows the card shows before deferring to the full news page. Four rather
// than five since this list became one of two columns: side by side the two lists are
// read across as much as down, and the pair is what sets the height of the block.
const ROWS_SHOWN = 4;

// Per-article transparency list: the articles that drive the news score most, with a
// link to the full news sentiment page for the rest.
export default function NewsArticles({
  articles,
  ticker,
  dayLabel: day,
}: {
  articles: NewsArticle[];
  ticker: string;
  // The day these articles belong to, when they came from a selected bar on the trend
  // chart rather than from the whole window. Named for the same reason SocialPosts
  // names its day: a list that changes when you click a chart has to say what it
  // changed to, or the reader reads the day's coverage as the week's.
  dayLabel?: string;
}) {
  // A day with no coverage is ordinary once the chart drives this list, and returning
  // null would leave the News signal with a bar, a caption and nothing under it, plus
  // no route to the articles that do exist. Mirrors the same case in SocialPosts.
  if (!articles || articles.length === 0) {
    return (
      <div className="space-y-2">
        {day && (
          <p className="text-[11px] text-brand-muted-fg">
            No articles published on {formatDayLabel(day)}.
          </p>
        )}
        <Link
          to={`/asset/${ticker}/news`}
          className="inline-block text-xs text-brand-primary font-medium hover:underline"
        >
          See every article from the last {NEWS_LOOKBACK_DAYS} days
        </Link>
      </div>
    );
  }

  const shown = sortArticlesByInfluence(articles).slice(0, ROWS_SHOWN);
  const counts = tierCounts(articles);

  return (
    <div className="space-y-2">
      {/* Sentence case at footnote weight, not the uppercase eyebrow this used to
          be. That eyebrow style marks the card's own sections, and wearing it here
          announced the list as a new section rather than as the evidence under the
          News bar directly above it. */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-brand-muted-fg">
        <span>
          {day
            ? `Articles · ${formatDayLabel(day)}`
            : "Top articles by influence"}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-emerald-600 font-medium">
            T1 {counts[1] ?? 0}
          </span>
          <span className="text-amber-600 font-medium">T2 {counts[2] ?? 0}</span>
          <span className="text-slate-500 font-medium">T3 {counts[3] ?? 0}</span>
        </span>
      </div>
      {/* Hairlines rather than a filled, bordered box. Sitting inside the card this
          list was one more rounded panel at the same radius as its neighbours, and
          a stack of those is what made the tab read as loose blocks. Rows keep
          their inset so they hang under the divider lines as a list. */}
      <ul className="divide-y divide-brand-border/40 border-y border-brand-border/40">
        {shown.map((a, i) => (
          <li key={i}>
            <NewsArticleRow article={a} />
          </li>
        ))}
      </ul>
      {/* Day-scoped, the count in this list describes one day, so a link offering
          "all N" would be counting the wrong thing. It names the window instead, the
          way SocialPosts does, and stays unconditional so there is always a route
          through even when the day holds five or fewer. */}
      {day ? (
        <Link
          to={`/asset/${ticker}/news`}
          className="inline-block text-xs text-brand-primary font-medium hover:underline"
        >
          See every article from the last {NEWS_LOOKBACK_DAYS} days
        </Link>
      ) : (
        articles.length > ROWS_SHOWN && (
          <Link
            to={`/asset/${ticker}/news`}
            className="inline-block text-xs text-brand-primary font-medium hover:underline"
          >
            Show all {articles.length} articles
          </Link>
        )
      )}
    </div>
  );
}
