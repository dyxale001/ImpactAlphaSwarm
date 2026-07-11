import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { tierMeta } from "./sentimentDisplay";
import SentimentIndicator from "./SentimentIndicator";

export type NewsArticle = {
  source?: string;
  tier?: number | null;
  date?: string;
  headline?: string;
  url?: string | null;
  sentiment?: string;
};

// Per-article transparency list: each article's date, reliability tier,
// publisher, headline and (when available) a link to the source.
export default function NewsArticles({ articles }: { articles: NewsArticle[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!articles || articles.length === 0) return null;

  const shown = expanded ? articles : articles.slice(0, 5);
  const counts = articles.reduce(
    (acc, a) => {
      const t = a.tier === 1 || a.tier === 2 || a.tier === 3 ? a.tier : 0;
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    },
    {} as Record<number, number>,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
          Articles used ({articles.length})
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
        {shown.map((a, i) => {
          const t = tierMeta(a.tier);
          const row = (
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              <SentimentIndicator sentiment={a.sentiment} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-brand-fg line-clamp-2">
                  {a.headline || "—"}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-brand-muted-fg">
                  <span className="font-mono">{a.date || "—"}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full font-medium ${t.cls}`}
                  >
                    {t.label}
                  </span>
                  <span className="truncate">{a.source || "—"}</span>
                </div>
              </div>
              {a.url && (
                <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-brand-muted-fg" />
              )}
            </div>
          );
          return (
            <li key={i}>
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block hover:bg-brand-primary/5 transition-colors"
                >
                  {row}
                </a>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {articles.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-brand-primary font-medium hover:underline"
        >
          {expanded ? "Show less" : `Show all ${articles.length}`}
        </button>
      )}
    </div>
  );
}
