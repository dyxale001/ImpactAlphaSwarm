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
import { describeRunAge } from "../../../utils/staleness";
import { WidgetEmpty, PinPrompt, PinnedHeader } from "./widgetChrome";

// Sentiment widgets, each scoped to the asset chosen for that widget alone.
//
// These read useSentimentHistory rather than useAssetDetails on purpose. The
// history endpoint is per-ticker and independent of any AI run, whereas a
// recommendation exists only for assets in the user's own latest run. The
// picker offers exactly that run's assets, but a choice outlives the run it was
// made from: the next run scores a different set, and a ticker dropped from it
// would otherwise show an empty widget with no explanation.

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

/** Seven days of news and social sentiment for this widget's asset. */
export function SentimentTrendWidget({
  ticker,
  setTicker,
}: WidgetProps) {
  const { points, daysWithData, isLoading, isSeeding, error } =
    useSentimentHistory(ticker ?? undefined);
  const newsDays = useMemo(() => newsDaysFromHistory(points), [points]);

  if (!ticker) {
    return <PinPrompt what="the sentiment trend" setTicker={setTicker} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
        <Link
          to={`/asset/${ticker}`}
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

/** The articles carrying this widget's asset's most recent day of coverage. */
export function NewsInfluentialWidget({
  ticker,
  setTicker,
}: WidgetProps) {
  const { points, isLoading, error } = useSentimentHistory(
    ticker ?? undefined,
  );

  const day = useMemo(() => {
    const days = points.map((p) => ({
      date: p.date,
      items: p.top_articles ?? [],
    }));
    return latestDayWith(days);
  }, [points]);

  if (!ticker) {
    return <PinPrompt what="news coverage" setTicker={setTicker} />;
  }
  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-brand-bg/70" />;
  }
  if (error) {
    return <WidgetEmpty message={error} />;
  }
  if (!day) {
    return (
      <div className="flex h-full flex-col gap-3">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
        <WidgetEmpty
          grow
          message={`No news stored for ${ticker} in the last seven days.`}
        />
      </div>
    );
  }

  const articles = sortArticlesByInfluence(day.items).slice(0, MAX_ROWS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
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
        to={`/asset/${ticker}/news`}
        className="inline-block text-xs font-semibold text-brand-primary hover:underline"
      >
        All news sentiment →
      </Link>
    </div>
  );
}

/** What people are posting about this widget's asset, and which way it leans. */
export function SocialBuzzWidget({
  ticker,
  setTicker,
}: WidgetProps) {
  const { points, isLoading, error } = useSentimentHistory(
    ticker ?? undefined,
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

  if (!ticker) {
    return <PinPrompt what="social chatter" setTicker={setTicker} />;
  }
  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-brand-bg/70" />;
  }
  if (error) {
    return <WidgetEmpty message={error} />;
  }
  if (!day) {
    return (
      <div className="flex h-full flex-col gap-3">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
        <WidgetEmpty
          grow
          message={`Nobody has posted about ${ticker} in the last seven days that we have on record.`}
        />
      </div>
    );
  }

  const posts = sortPostsByInfluence(day.items).slice(0, MAX_ROWS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PinnedHeader ticker={ticker} setTicker={setTicker} />
        <span className="text-[11px] text-brand-muted-fg">
          {formatDay(day.date)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip">{day.count} posts</span>
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
            <SocialPostRow post={post} ticker={ticker} />
          </li>
        ))}
      </SourceList>
      <Link
        to={`/asset/${ticker}/social`}
        className="inline-block text-xs font-semibold text-brand-primary hover:underline"
      >
        All social sentiment →
      </Link>
    </div>
  );
}

/**
 * When sentiment last refreshed, across every ticker.
 *
 * The one widget with no data of its own to draw, so it carries the theme
 * rather than a chart: the reading sits on the dark forest hero the top pick
 * uses, under the lime accent, and the exact timestamp and the explainer follow
 * in the quieter panel treatment the whale widgets use for their sub-panels.
 * Plain text on white made it read as an unstyled corner of the dashboard.
 */
export function SentimentFreshnessWidget() {
  const { updatedAt, isLoading } = useSentimentLastUpdated();

  const age = updatedAt ? describeRunAge(updatedAt) : null;

  return (
    <div className="space-y-2.5">
      <div className="hero-card overflow-hidden px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-brand-accent" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-accent">
            Sentiment updated
          </p>
        </div>
        <p className="mt-1.5 text-lg font-bold leading-tight text-brand-bg">
          {isLoading ? "Checking" : (age ?? "Not available")}
        </p>
        {updatedAt ? (
          <p className="mt-0.5 font-mono text-[11px] text-brand-bg/70">
            {new Date(updatedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      <p className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-3 py-2.5 text-[11px] leading-relaxed text-brand-muted-fg">
        News and social readings are topped up on their own schedule, separately
        from your analysis run.
      </p>
    </div>
  );
}
