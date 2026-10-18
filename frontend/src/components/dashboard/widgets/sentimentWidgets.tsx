import { useMemo } from "react";
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
import { WidgetEmpty, WidgetHeaderLink, WidgetLoading, PinPrompt, PinnedHeader } from "./widgetChrome";

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
      <PinnedHeader ticker={ticker} setTicker={setTicker} />
      <WidgetHeaderLink to={`/asset/${ticker}?tab=sentiment`}>Full analysis</WidgetHeaderLink>
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
    return <WidgetLoading rows={3} />;
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
      <PinnedHeader ticker={ticker} setTicker={setTicker} />
      <WidgetHeaderLink to={`/asset/${ticker}/news`}>All news</WidgetHeaderLink>
      <p className="text-xs font-semibold text-brand-muted-fg">{formatDay(day.date)}</p>
      <SourceList nested>
        {articles.map((article, i) => (
          <li key={`${article.url ?? article.headline}-${i}`}>
            <NewsArticleRow article={article} />
          </li>
        ))}
      </SourceList>
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
    return <WidgetLoading rows={3} />;
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
      <PinnedHeader ticker={ticker} setTicker={setTicker} />
      <WidgetHeaderLink to={`/asset/${ticker}/social`}>All social</WidgetHeaderLink>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-brand-muted-fg">{formatDay(day.date)}</span>
        <span className="chip tabular-nums">{day.count} posts</span>
        <span className="chip chip-up tabular-nums">{day.bullish} bullish</span>
        <span className="chip chip-down tabular-nums">{day.bearish} bearish</span>
      </div>

      <SourceList nested>
        {posts.map((post, i) => (
          <li key={`${post.url ?? post.author}-${i}`}>
            <SocialPostRow post={post} ticker={ticker} />
          </li>
        ))}
      </SourceList>
    </div>
  );
}

/**
 * When sentiment last refreshed, across every ticker: the reading in an inset,
 * as the Settings and run status tiles show a figure, and why it differs from
 * the analysis run.
 */
export function SentimentFreshnessWidget() {
  const { updatedAt, isLoading } = useSentimentLastUpdated();

  const age = updatedAt ? describeRunAge(updatedAt) : null;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="as-inset flex items-start gap-3 p-4">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-brand-muted-fg">Sentiment updated</p>
          <p className="mt-1 text-xl font-bold tracking-[-0.01em] text-forest-900">
            {isLoading ? "Checking" : (age ?? "Not available")}
          </p>
          {updatedAt ? (
            <p className="mt-0.5 text-xs tabular-nums text-brand-muted-fg">
              {new Date(updatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-brand-muted-fg">
        News and social readings are topped up on their own schedule, separately
        from your analysis run.
      </p>
    </div>
  );
}
