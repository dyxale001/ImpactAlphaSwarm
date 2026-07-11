import { useState } from "react";
import { ExternalLink, Heart, MessageSquare, Repeat2 } from "lucide-react";
import SentimentIndicator from "./SentimentIndicator";

export type SocialPost = {
  platform?: string;
  author?: string | null;
  date?: string;
  text?: string;
  url?: string | null;
  likes?: number;
  reshares?: number;
  replies?: number;
  sentiment?: string;
};

// A single engagement count with its icon; hidden when the count is zero.
function EngagementStat({
  icon: Icon,
  count,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  label: string;
}) {
  if (!count) return null;
  return (
    <span className="flex items-center gap-1" title={`${count} ${label}`}>
      <Icon className="h-3 w-3" />
      {count}
    </span>
  );
}

// Per-post transparency list: each StockTwits post's date, author, text and
// (when available) a link to the source. Mirrors NewsArticles so users can see
// exactly which social posts fed the sentiment score.
export default function SocialPosts({ posts }: { posts: SocialPost[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!posts || posts.length === 0) return null;

  const shown = expanded ? posts : posts.slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
          Posts used ({posts.length})
        </span>
        <span className="text-[11px] text-brand-muted-fg font-medium">
          StockTwits
        </span>
      </div>
      <ul className="divide-y divide-brand-border/40 rounded-2xl border border-brand-border/60 bg-brand-bg/40 overflow-hidden">
        {shown.map((p, i) => {
          const row = (
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              <SentimentIndicator sentiment={p.sentiment} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-brand-fg line-clamp-3">
                  {p.text || "—"}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-brand-muted-fg">
                  <span className="font-mono">{p.date || "—"}</span>
                  <span className="truncate">
                    {p.author ? `@${p.author}` : "StockTwits"}
                  </span>
                  <EngagementStat icon={Heart} count={p.likes} label="likes" />
                  <EngagementStat
                    icon={MessageSquare}
                    count={p.replies}
                    label="replies"
                  />
                  <EngagementStat
                    icon={Repeat2}
                    count={p.reshares}
                    label="reshares"
                  />
                </div>
              </div>
              {p.url && (
                <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-brand-muted-fg" />
              )}
            </div>
          );
          return (
            <li key={i}>
              {p.url ? (
                <a
                  href={p.url}
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
      {posts.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-brand-primary font-medium hover:underline"
        >
          {expanded ? "Show less" : `Show all ${posts.length}`}
        </button>
      )}
    </div>
  );
}
