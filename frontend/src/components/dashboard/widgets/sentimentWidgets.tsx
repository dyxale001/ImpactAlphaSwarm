import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import { useSentimentHistory } from "../../../hooks/useSentimentHistory";
import { useSentimentLastUpdated } from "../../../hooks/useSentimentLastUpdated";
import { SentimentTrendChart } from "../../research/SentimentTrendChart";
import { newsDaysFromHistory } from "../../research/newsDaily";
import {
  NewsArticleRow,
  sortArticlesByInfluence,
} from "../../research/NewsArticles";
import { SocialPostRow, sortPostsByInfluence } from "../../research/SocialPosts";
import { SourceList } from "../../research/sourcePageControls";
import { formatDay } from "../../research/sentimentDays";
import { WidgetEmpty, PinPrompt, PinnedHeader } from "./widgetChrome";

// Sentiment widgets, all scoped to the dashboard's pinned ticker.
//
// These read useSentimentHistory rather than useAssetDetails on purpose. The
// history endpoint is per-ticker and independent of any AI run, whereas a
// recommendation exists only for assets in the user's own latest run, which is
// about thirty names out of everything a reader might pin. Pinning an asset the
// run did not score would otherwise show an empty widget with no explanation.

const MAX_ROWS = 5;

/** The most recent day in the window that actually carries something. Days with
 *  no coverage are real days, so the newest is not automatically the useful one. */
function latestDayWith<T>(
  days: { date: string; items: T[] }[],
): { date: string; items: T[] } | null {
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].items.length > 0) return days[i];
  }
  return null;
}

/** Seven days of news and social sentiment for the pinned asset. */
export function SentimentTrendWidget({
  pinnedTicker,
  setPinnedTicker,
}: WidgetProps) {
  const { points, daysWithData, isLoading, isSeeding, error } =
    useSentimentHistory(pinnedTicker ?? undefined);
  const newsDays = useMemo(() => newsDaysFromHistory(points), [points]);

  if (!pinnedTicker) {
    return <PinPrompt what="the sentiment trend" setPinnedTicker={setPinnedTicker} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <PinnedHeader ticker={pinnedTicker} setPinnedTicker={setPinnedTicker} />
        <Link
          to={`/asset/${pinnedTicker}`}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Full analysis →
        </Link>
      </div>
      <SentimentTrendChart
        points={points}
        daysWithData={daysWithData}
        isLoading={isLoading}
        error={error}
        isSeeding={isSeeding}
        newsDays={newsDays}
      />
    </div>
  );
}

/** The articles carrying the pinned asset's most recent day of coverage. */
export function NewsInfluentialWidget({
  pinnedTicker,
  setPinnedTicker,
}: WidgetProps) {
  const { points, isLoading, error } = useSentimentHistory(
    pinnedTicker ?? undefined,
  );

  const day = useMemo(() => {
    const days = points.map((p) => ({
      date: p.date,
      items: p.top_articles ?? [],
    }));
    return latestDayWith(days);
  }, [points]);

  if (!pinnedTicker) {
    return <PinPrompt what="news coverage" setPinnedTicker={setPinnedTicker} />;
  }
  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-brand-bg/70" />;
  }
  if (error) {
    return <WidgetEmpty message={error} />;
  }
  if (!day) {
    return (
      <div className="space-y-3">
        <PinnedHeader ticker={pinnedTicker} setPinnedTicker={setPinnedTicker} />
        <WidgetEmpty
          message={`No news stored for ${pinnedTicker} in the last seven days.`}
        />
      </div>
    );
  }

  const articles = sortArticlesByInfluence(day.items).slice(0, MAX_ROWS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PinnedHeader ticker={pinnedTicker} setPinnedTicker={setPinnedTicker} />
        <span className="text-[11px] text-brand-muted-fg">
          {formatDay(day.date)}
        </span>
      </div>
      <SourceList>
        {articles.map((article, i) => (
          <li key={`${article.url ?? article.headline}-${i}`}>
            <NewsArticleRow article={article} />
          </li>
        ))}
      </SourceList>
      <Link
        to={`/asset/${pinnedTicker}/news`}
        className="inline-block text-xs font-semibold text-brand-primary hover:underline"
      >
        All news sentiment →
      </Link>
    </div>
  );
}

/** What people are posting about the pinned asset, and which way it leans. */
export function SocialBuzzWidget({
  pinnedTicker,
  setPinnedTicker,
}: WidgetProps) {
  const { points, isLoading, error } = useSentimentHistory(
    pinnedTicker ?? undefined,
  );

  const day = useMemo(() => {
    const days = points.map((p) => ({
      date: p.date,
      items: p.top_posts ?? [],
      bullish: p.bullish,
      bearish: p.bearish,
      count: p.post_count,
    }));
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (days[i].items.length > 0) return days[i];
    }
    return null;
  }, [points]);

  if (!pinnedTicker) {
    return <PinPrompt what="social chatter" setPinnedTicker={setPinnedTicker} />;
  }
  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-brand-bg/70" />;
  }
  if (error) {
    return <WidgetEmpty message={error} />;
  }
  if (!day) {
    return (
      <div className="space-y-3">
        <PinnedHeader ticker={pinnedTicker} setPinnedTicker={setPinnedTicker} />
        <WidgetEmpty
          message={`Nobody has posted about ${pinnedTicker} in the last seven days that we have on record.`}
        />
      </div>
    );
  }

  const posts = sortPostsByInfluence(day.items).slice(0, MAX_ROWS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PinnedHeader ticker={pinnedTicker} setPinnedTicker={setPinnedTicker} />
        <span className="text-[11px] text-brand-muted-fg">
          {formatDay(day.date)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip bg-brand-border/30 text-brand-muted-fg">
          {day.count} posts
        </span>
        <span className="chip bg-semantic-success/15 text-semantic-success">
          {day.bullish} bullish
        </span>
        <span className="chip bg-semantic-danger/15 text-semantic-danger">
          {day.bearish} bearish
        </span>
      </div>

      <SourceList>
        {posts.map((post, i) => (
          <li key={`${post.url ?? post.author}-${i}`}>
            <SocialPostRow post={post} ticker={pinnedTicker} />
          </li>
        ))}
      </SourceList>
      <Link
        to={`/asset/${pinnedTicker}/social`}
        className="inline-block text-xs font-semibold text-brand-primary hover:underline"
      >
        All social sentiment →
      </Link>
    </div>
  );
}

/** When sentiment last refreshed, across every ticker. */
export function SentimentFreshnessWidget() {
  const { updatedAt, isLoading } = useSentimentLastUpdated();

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
        Sentiment updated
      </p>
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 shrink-0 text-brand-primary" />
        <p className="text-sm font-semibold text-brand-fg">
          {isLoading
            ? "Checking"
            : updatedAt
              ? new Date(updatedAt).toLocaleString()
              : "Not available"}
        </p>
      </div>
      <p className="text-[11px] leading-relaxed text-brand-muted-fg">
        News and social readings are topped up on their own schedule, separately
        from your analysis run.
      </p>
    </div>
  );
}
