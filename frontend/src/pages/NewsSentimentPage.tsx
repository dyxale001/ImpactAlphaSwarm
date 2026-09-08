import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Newspaper } from "lucide-react";
import AssetDetailsSkeleton from "../components/research/AssetDetailsSkeleton";
import {
  NewsArticleRow,
  tierCounts,
  type NewsArticle,
} from "../components/research/NewsArticles";
import { SentimentTrendChart } from "../components/research/SentimentTrendChart";
import { dayLabel } from "../components/research/sentimentDays";
import {
  newsDayIndex,
  newsDaysFromHistory,
} from "../components/research/newsDaily";
import {
  EmptyStateCard,
  SentimentFilterChips,
  SortToggle,
  SourceList,
  SourcePageHeader,
  SummaryStrip,
  TierFilterChips,
} from "../components/research/sourcePageControls";
import { useAssetDetails } from "../hooks/useAssetDetails";
import { useSentimentHistory } from "../hooks/useSentimentHistory";
import { useSentimentSources } from "../hooks/useSentimentSources";
import { SOCIAL_HISTORY_DAYS } from "../data/sentimentMethodology";
import type { SentimentHistoryPoint } from "../services/api/analysis";

// Full transparency page for the news side of the sentiment score.
//
// Same two granularities as the social page: the chart is one point per day across
// the window, the list underneath is one day's articles. Clicking a bar swaps the
// list, so the two always describe the same day rather than sitting side by side
// meaning different things.
export default function NewsSentimentPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const { asset, recommendation, isLoading } = useAssetDetails(ticker);
  const history = useSentimentHistory(ticker);

  const allArticles: NewsArticle[] = recommendation?.news_articles ?? [];

  // Per-day news for the chart's line and the list below: the history the backend
  // stored where it has any, and only otherwise the figure derived from the run's
  // article list. Preferring the stored series is the point of migrations/021; the
  // derivation is the fallback for deployments with NEWS_HISTORY_ENABLED still off.
  const newsDays = useMemo(() => {
    const stored = newsDaysFromHistory(history.points);
    return stored.size > 0 ? stored : newsDayIndex(allArticles);
  }, [history.points, allArticles]);

  // The news series, reshaped into the social point's shape so the shared trend
  // chart can plot it as its one line. The chart's `variant="news"` only switches
  // the copy from posts to articles; the geometry is identical. The date scaffold
  // is the history window where it has loaded, and the article dates themselves
  // before then, so the chart draws without waiting on the social walk.
  const newsPoints: SentimentHistoryPoint[] = useMemo(() => {
    const dates = history.points.length
      ? history.points.map((p) => p.date)
      : [...newsDays.keys()].sort();
    return dates.map((date) => {
      const day = newsDays.get(date);
      return {
        date,
        score: day?.score ?? null,
        post_count: day?.count ?? 0,
        bullish: 0,
        bearish: 0,
        top_posts: [],
        summary: null,
      };
    });
  }, [history.points, newsDays]);

  const newsDaysWithData = newsPoints.filter((p) => p.score !== null).length;

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Default to the most recent day that actually carries articles. Not simply the
  // last day in the window: if the last run's coverage stopped two days ago,
  // defaulting to today's key would show an empty list and let a reader conclude
  // there is no coverage at all.
  const defaultDay = useMemo(() => {
    const withArticles = [...newsDays.values()]
      .filter((d) => d.count > 0)
      .map((d) => d.date)
      .sort();
    return withArticles[withArticles.length - 1] ?? null;
  }, [newsDays]);

  const activeDay = selectedDay ?? defaultDay;
  const dayNews = activeDay ? newsDays.get(activeDay) : undefined;
  const dayArticles: NewsArticle[] = dayNews?.articles ?? [];

  const {
    sentimentFilter,
    setSentimentFilter,
    tierFilter,
    setTierFilter,
    sort,
    setSort,
    bucketCounts,
    shown,
  } = useSentimentSources(dayArticles);

  if (isLoading) return <AssetDetailsSkeleton />;

  const tickerLabel = asset?.ticker ?? ticker?.toUpperCase() ?? "";
  const hasAnyArticles = [...newsDays.values()].some((d) => d.count > 0);

  // The day's real article total, which is not the same as how many we kept. A busy
  // day can carry more articles than the row holds, and showing the kept few beside
  // a taller bar would make the chart look broken rather than the list look trimmed.
  const dayTotal = dayNews?.count ?? dayArticles.length;
  const trimmed = dayTotal > dayArticles.length;

  return (
    <div className="max-w-5xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-6 animate-fade-in-up">
      <SourcePageHeader
        ticker={tickerLabel}
        icon={Newspaper}
        title="News Sentiment"
        subtitle={`How coverage of ${tickerLabel} moved over the last ${SOCIAL_HISTORY_DAYS} days.`}
        backHref={`/asset/${tickerLabel}?tab=sentiment`}
      />

      <SentimentTrendChart
        points={newsPoints}
        daysWithData={newsDaysWithData}
        isLoading={history.isLoading && history.points.length === 0}
        isSeeding={history.isSeeding}
        error={history.error}
        variant="news"
        selectedDay={activeDay}
        onSelectDay={setSelectedDay}
        selectHint="Click a day to read its articles"
      />

      {!recommendation || !hasAnyArticles ? (
        <EmptyStateCard message="No news articles were used in the latest analysis for this asset." />
      ) : (
        <>
          <SummaryStrip
            pills={[
              {
                label: "News score",
                value:
                  dayNews?.score != null
                    ? `${Math.round(dayNews.score)} / 100`
                    : "—",
              },
              {
                label: "Articles",
                value: trimmed
                  ? `${dayTotal} (top ${dayArticles.length} shown)`
                  : dayTotal,
              },
              { label: "Positive", value: bucketCounts.Positive },
              { label: "Negative", value: bucketCounts.Negative },
            ]}
          />

          {/* The day's articles, framed the way DaySummaryPanel frames its prose and
              the social page frames its posts: an accent-outlined panel with the day
              as its heading, the list in a quiet inner box under a labelled eyebrow. */}
          <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h4 className="text-sm font-semibold text-brand-fg">
                {activeDay ? dayLabel(activeDay) : "Articles"}
              </h4>
              {activeDay ? (
                <span className="text-[11px] text-brand-muted-fg">
                  {trimmed
                    ? `${dayArticles.length} of ${dayTotal} scored articles shown`
                    : `${dayTotal} ${dayTotal === 1 ? "article" : "articles"}`}
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <SentimentFilterChips
                  total={dayArticles.length}
                  counts={bucketCounts}
                  value={sentimentFilter}
                  onChange={setSentimentFilter}
                />
                <span className="mx-1 h-4 w-px bg-brand-border/60" />
                <TierFilterChips
                  counts={tierCounts(dayArticles)}
                  value={tierFilter}
                  onChange={setTierFilter}
                />
              </div>
              <SortToggle value={sort} onChange={setSort} />
            </div>

            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-2 flex items-center gap-1.5">
                <Newspaper className="w-3 h-3 text-brand-primary" />
                Most influential articles
              </div>
              {shown.length === 0 ? (
                <p className="text-sm text-brand-muted-fg italic">
                  No articles match the selected filters.
                </p>
              ) : (
                <SourceList nested>
                  {shown.map((a, i) => (
                    <li key={i}>
                      <NewsArticleRow article={a} clamp={false} />
                    </li>
                  ))}
                </SourceList>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
