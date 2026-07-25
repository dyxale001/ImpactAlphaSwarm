import { Link } from "react-router-dom";
import { ExternalLink, Heart, MessageSquare, Repeat2 } from "lucide-react";
import PostText from "./PostText";
import SentimentSignals from "./SentimentSignals";

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
  sentiment_score?: number; // 0-100, this post's own text sentiment
  influence?: number; // % of the social score this post drives (recency)
};

// Highest-influence first; items without an influence value sink to the end.
export function sortPostsByInfluence(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => (b.influence ?? -1) - (a.influence ?? -1));
}

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

// One StockTwits post row, shared by the compact top-5 list on the asset page
// (clamp on) and the full social sentiment page (clamp off).
export function SocialPostRow({
  post: p,
  ticker,
  clamp = true,
}: {
  post: SocialPost;
  ticker?: string;
  clamp?: boolean;
}) {
  const row = (
    <div className={clamp ? "px-3 py-2.5" : "px-4 py-3.5"}>
      <p
        className={`text-sm text-brand-fg ${clamp ? "line-clamp-3" : "leading-relaxed"}`}
      >
        <PostText text={p.text} ticker={ticker} />
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-brand-muted-fg">
        <span className="font-mono">{p.date || "—"}</span>
        <span className="truncate">
          {p.author ? `@${p.author}` : "StockTwits"}
        </span>
        <SentimentSignals score={p.sentiment_score} influence={p.influence} />
        <EngagementStat icon={Heart} count={p.likes} label="likes" />
        <EngagementStat
          icon={MessageSquare}
          count={p.replies}
          label="replies"
        />
        <EngagementStat icon={Repeat2} count={p.reshares} label="reshares" />
        {p.url && (
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-brand-muted-fg" />
        )}
      </div>
    </div>
  );
  if (!p.url) return row;
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noreferrer"
      className="block hover:bg-brand-primary/5 transition-colors"
    >
      {row}
    </a>
  );
}

// Per-post transparency list: the five posts that drive the social score most,
// with a link to the full social sentiment page for the rest. Mirrors
// NewsArticles so users can see exactly which posts fed the sentiment score.
export default function SocialPosts({
  posts,
  ticker,
}: {
  posts: SocialPost[];
  ticker: string;
}) {
  if (!posts || posts.length === 0) return null;

  const shown = sortPostsByInfluence(posts).slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
          Top posts by influence
        </span>
        <span className="text-[11px] text-brand-muted-fg font-medium">
          StockTwits
        </span>
      </div>
      <ul className="divide-y divide-brand-border/40 rounded-2xl border border-brand-border/60 bg-brand-bg/40 overflow-hidden">
        {shown.map((p, i) => (
          <li key={i}>
            <SocialPostRow post={p} ticker={ticker} />
          </li>
        ))}
      </ul>
      {posts.length > 5 && (
        <Link
          to={`/asset/${ticker}/social`}
          className="inline-block text-xs text-brand-primary font-medium hover:underline"
        >
          Show all {posts.length} posts
        </Link>
      )}
    </div>
  );
}
