import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { tierMeta } from "./sentimentDisplay";
import SentimentSignals from "./SentimentSignals";

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
        <span className="truncate">{a.source || "—"}</span>
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

// Per-article transparency list: the five articles that drive the news score
// most, with a link to the full news sentiment page for the rest.
export default function NewsArticles({
  articles,
  ticker,
}: {
  articles: NewsArticle[];
  ticker: string;
}) {
  if (!articles || articles.length === 0) return null;

  const shown = sortArticlesByInfluence(articles).slice(0, 5);
  const counts = tierCounts(articles);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
          Top articles by influence
        </span>
        <span className="text-[11px] text-brand-muted-fg flex items-center gap-2">
          <span className="text-emerald-600 font-medium">
            T1 {counts[1] ?? 0}
          </span>
          <span className="text-amber-600 font-medium">T2 {counts[2] ?? 0}</span>
          <span className="text-slate-500 font-medium">T3 {counts[3] ?? 0}</span>
        </span>
      </div>
      <ul className="divide-y divide-brand-border/40 rounded-2xl border border-brand-border/60 bg-brand-bg/40 overflow-hidden">
        {shown.map((a, i) => (
          <li key={i}>
            <NewsArticleRow article={a} />
          </li>
        ))}
      </ul>
      {articles.length > 5 && (
        <Link
          to={`/asset/${ticker}/news`}
          className="inline-block text-xs text-brand-primary font-medium hover:underline"
        >
          Show all {articles.length} articles
        </Link>
      )}
    </div>
  );
}
