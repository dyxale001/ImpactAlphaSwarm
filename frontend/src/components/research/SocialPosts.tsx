import { Link } from "react-router-dom";
import {
  ExternalLink,
  Heart,
  MessageSquare,
  Repeat2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import PostText from "./PostText";
import SentimentSignals from "./SentimentSignals";
import { dayLabel as formatDayLabel } from "./sentimentDays";

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

// Two letters for the avatar, from the handle. Falls back to the platform's own
// initials when a post carries no author (some StockTwits rows don't).
function avatarInitials(name?: string | null): string {
  const clean = (name ?? "").replace(/[^a-zA-Z0-9]/g, "");
  return clean.slice(0, 2).toUpperCase() || "ST";
}

// A stable hue per handle, so the feed reads like a feed: different people wear
// different colours and you can scan by them. Same handle, same colour, every render.
function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

// StockTwits posts carry an explicit Bullish / Bearish tag; ours is inferred from
// the post's own text sentiment on the same 45 / 55 split the rest of the page uses.
function bullBearTag(score?: number): {
  label: string;
  cls: string;
  Icon: React.ComponentType<{ className?: string }> | null;
} | null {
  if (score == null) return null;
  if (score >= 55)
    return {
      label: "Bullish",
      cls: "bg-emerald-500/12 text-emerald-600",
      Icon: TrendingUp,
    };
  if (score <= 45)
    return {
      label: "Bearish",
      cls: "bg-rose-500/12 text-rose-600",
      Icon: TrendingDown,
    };
  return { label: "Neutral", cls: "bg-slate-400/15 text-slate-500", Icon: null };
}

// A post timestamp the way a social client shows one: hours for anything inside a
// day, then a short date. Raw string through if it will not parse.
function formatWhen(raw?: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const hours = (Date.now() - d.getTime()) / 3_600_000;
  if (hours >= 0 && hours < 24) return `${Math.max(1, Math.round(hours))}h`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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

// One StockTwits post, in two shapes:
//   * clamp on  -- the compact top-few list on the asset card: text, then a
//     hairline meta row. Space is tight there and it sits beside the news list, so
//     it stays a terse evidence row.
//   * clamp off -- the full social sentiment page: a proper post card with an
//     avatar, a handle line, the body at reading size and an engagement bar, so
//     the feed looks like the platform it came from rather than a list of quotes.
export function SocialPostRow({
  post: p,
  ticker,
  clamp = true,
}: {
  post: SocialPost;
  ticker?: string;
  clamp?: boolean;
}) {
  const linkWrap = (inner: React.ReactNode) =>
    p.url ? (
      <a
        href={p.url}
        target="_blank"
        rel="noreferrer"
        className="block hover:bg-brand-primary/5 transition-colors"
      >
        {inner}
      </a>
    ) : (
      <>{inner}</>
    );

  if (clamp) {
    return linkWrap(
      <div className="px-3 py-2.5">
        <p className="text-sm text-brand-fg break-words line-clamp-3">
          <PostText text={p.text} ticker={ticker} />
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-brand-muted-fg">
          <span className="font-mono">{p.date || "—"}</span>
          <span className="min-w-0 truncate">
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
      </div>,
    );
  }

  const handle = p.author ? `@${p.author}` : "StockTwits";
  const when = formatWhen(p.date);
  const tag = bullBearTag(p.sentiment_score);
  const hue = avatarHue(p.author || "stocktwits");

  return linkWrap(
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-9 w-9 shrink-0 select-none place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: `hsl(${hue} 42% 42%)` }}
        >
          {avatarInitials(p.author)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
            <span className="font-semibold text-brand-fg">{handle}</span>
            <span className="text-brand-muted-fg">· StockTwits</span>
            {when && <span className="text-brand-muted-fg">· {when}</span>}
            {tag && (
              <span
                className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tag.cls}`}
              >
                {tag.Icon && <tag.Icon className="h-3 w-3" />}
                {tag.label}
              </span>
            )}
          </div>

          <p className="mt-1.5 break-words text-[15px] leading-relaxed text-brand-fg">
            <PostText text={p.text} ticker={ticker} />
          </p>

          {/* Wraps, because it does not fit. Three engagement counts, the share of
              the score and the external-link glyph come to roughly 250px, against
              about 215px of row once the page gutter, the panel, the list border and
              the avatar have taken theirs on a 360px phone. Unwrapped, the counts
              squashed and "of score" spilled past the card. The influence figure
              keeps its ml-auto, so on a wide screen the row is unchanged. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-brand-muted-fg">
            <span className="flex items-center gap-1.5" title="Likes">
              <Heart className="h-4 w-4" />
              {p.likes ?? 0}
            </span>
            <span className="flex items-center gap-1.5" title="Replies">
              <MessageSquare className="h-4 w-4" />
              {p.replies ?? 0}
            </span>
            <span className="flex items-center gap-1.5" title="Reshares">
              <Repeat2 className="h-4 w-4" />
              {p.reshares ?? 0}
            </span>
            {p.influence != null && (
              <span
                className="ml-auto font-medium text-brand-primary"
                title="Influence: how much of the overall social score this post drives, after recency weighting."
              >
                {p.influence < 1 ? "<1%" : `${Math.round(p.influence)}%`} of score
              </span>
            )}
            {p.url && (
              <ExternalLink
                className={`h-3.5 w-3.5 shrink-0 ${p.influence != null ? "" : "ml-auto"}`}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
  );
}

// Kept in step with NewsArticles: the two render as a pair of columns on the asset
// card, and different row counts either side would leave one column hanging.
const ROWS_SHOWN = 4;

// Per-post transparency list: the posts that drive the social score most, with a link
// to the full social sentiment page for the rest. Mirrors NewsArticles so users can
// see exactly which posts fed the sentiment score.
export default function SocialPosts({
  posts,
  ticker,
  dayLabel: day,
  dayTotal,
}: {
  posts: SocialPost[];
  ticker: string;
  // The day these posts belong to, when they came from a selected bar on the trend
  // chart rather than from the latest run. Named, because a list that changes when you
  // click a chart has to say what it changed to.
  dayLabel?: string;
  // That day's real post count, which is not the same as how many are kept. A busy day
  // can score 143 posts while the row holds the top few, and showing the kept number
  // beside a bar of 143 makes the chart look broken rather than the list look trimmed.
  dayTotal?: number;
}) {
  // No posts in the latest run does not mean no history. The run reaches back a couple
  // of days; the trend page reads a stored week, so a ticker that was quiet since the
  // last run can still have a chart worth opening. Returning null here would leave the
  // card with no way through to it, which is why this is a link rather than nothing.
  if (!posts || posts.length === 0) {
    return (
      <Link
        to={`/asset/${ticker}/social`}
        className="inline-block text-xs text-brand-primary font-medium hover:underline"
      >
        See the daily sentiment trend
      </Link>
    );
  }

  const shown = sortPostsByInfluence(posts).slice(0, ROWS_SHOWN);

  return (
    <div className="space-y-2">
      {/* Sentence case at footnote weight, matching NewsArticles: both lists are
          evidence under their signal bar, not sections in their own right. */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-brand-muted-fg">
        <span>
          {day ? `Top posts · ${formatDayLabel(day)}` : "Top posts by influence"}
        </span>
        <span className="font-medium">
          {dayTotal != null && dayTotal > shown.length
            ? `${shown.length} of ${dayTotal} · StockTwits`
            : "StockTwits"}
        </span>
      </div>
      {/* Hairlines, not a filled panel. See the same change in NewsArticles. */}
      <ul className="divide-y divide-brand-border/40 border-y border-brand-border/40">
        {shown.map((p, i) => (
          <li key={i}>
            <SocialPostRow post={p} ticker={ticker} />
          </li>
        ))}
      </ul>
      {/* Always shown, never conditional on how many posts this card happens to hold.
          It used to render only when there were more than five, which stopped working
          the moment the stored list was capped at exactly five: the condition could no
          longer be true, and this was the only route to the trend chart.

          The label no longer counts posts either. This row holds the top few of the
          latest run; the page it links to holds a daily chart and each day's posts, so
          a count taken from here would describe neither. */}
      <Link
        to={`/asset/${ticker}/social`}
        className="inline-block text-xs text-brand-primary font-medium hover:underline"
      >
        See the daily trend and every post
      </Link>
    </div>
  );
}
