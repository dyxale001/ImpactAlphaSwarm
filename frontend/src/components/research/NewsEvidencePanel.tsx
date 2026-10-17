import { useMemo, useState } from "react";
import { NewsArticleRow, tierCounts, type NewsArticle } from "./NewsArticles";
import { SentimentTrendChart } from "./SentimentTrendChart";
import { dayLabel, dayPhrase } from "./sentimentDays";
import { newsDayIndex, newsDaysFromHistory } from "./newsDaily";
import {
  EmptyStateCard,
  EvidenceDayCard,
  FilterChipRow,
  SentimentFilterChips,
  SortToggle,
  SourceList,
  SummaryStrip,
  TierFilterChips,
  VerdictChip,
} from "./sourcePageControls";
import { useSentimentSources } from "../../hooks/useSentimentSources";
import { SOCIAL_HISTORY_DAYS } from "../../data/sentimentMethodology";
import type { useSentimentHistory } from "../../hooks/useSentimentHistory";
import type { SentimentHistoryPoint } from "../../services/api/analysis";

// The news side of the sentiment evidence page.
//
// Two granularities, deliberately: the chart is one point per day across the window,
// the list underneath is one day's articles. Choosing a day on the chart swaps the
// list, so the two always describe the same day.
export default function NewsEvidencePanel({
  recommendation,
  history,
}: {
  recommendation: any;
  history: ReturnType<typeof useSentimentHistory>;
}) {
  const allArticles: NewsArticle[] = recommendation?.news_articles ?? [];

  // Per-day news for the chart and the list: the history the backend stored where it
  // has any, and only otherwise the figure derived from the run's article list.
  // Preferring the stored series is the point of migrations/021; the derivation is the
  // fallback for deployments with NEWS_HISTORY_ENABLED still off.
  const newsDays = useMemo(() => {
    const stored = newsDaysFromHistory(history.points);
    return stored.size > 0 ? stored : newsDayIndex(allArticles);
  }, [history.points, allArticles]);

  // The news series in the social point's shape, so the shared trend chart can plot
  // it as its one line; `variant="news"` only switches the copy to articles. The date
  // scaffold is the history window where it has loaded, and the article dates before
  // then, so the chart draws without waiting on the social walk.
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

  // Default to the most recent day that actually carries articles, not simply the last
  // day in the window: an empty default list would read as no coverage at all.
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

  const hasAnyArticles = [...newsDays.values()].some((d) => d.count > 0);
  // The day's real article count, which can exceed how many were kept to list.
  const dayTotal = dayNews?.count ?? dayArticles.length;
  const trimmed = dayTotal > dayArticles.length;

  return (
    <div className="space-y-4">
      <SentimentTrendChart
        points={newsPoints}
        daysWithData={newsDaysWithData}
        isLoading={history.isLoading && history.points.length === 0}
        isSeeding={history.isSeeding}
        error={history.error}
        variant="news"
        selectedDay={activeDay}
        onSelectDay={setSelectedDay}
        selectHint="Choose a day to read its articles"
      />

      {/* Only an absence of articles empties the page. The list and chart come from
          the stored daily history, so requiring the latest run's recommendation as
          well hid a week of stored coverage whenever that row was missing. */}
      {!hasAnyArticles ? (
        <EmptyStateCard message={`No news articles have been collected for this stock in the last ${SOCIAL_HISTORY_DAYS} days.`} />
      ) : (
        <>
          {/* The day's totals, beside a day total. Counting labels in the listed
              articles counted only the top few, so a busy day read "Articles 20,
              Positive 5" when twelve were positive. */}
          <SummaryStrip
            pills={[
              {
                label: "News score",
                value: dayNews?.score != null ? `${Math.round(dayNews.score)} / 100` : "—",
                chip: <VerdictChip score={dayNews?.score} />,
              },
              {
                label: "Articles",
                value: dayTotal,
                hint: trimmed ? `Top ${dayArticles.length} shown` : undefined,
              },
              { label: "Positive", value: dayNews?.bullish ?? bucketCounts.Positive },
              { label: "Negative", value: dayNews?.bearish ?? bucketCounts.Negative },
            ]}
          />

          <EvidenceDayCard
            title={activeDay ? dayLabel(activeDay) : "Articles"}
            caption={
              activeDay
                ? trimmed
                  ? `${dayArticles.length} of ${dayTotal} scored articles shown`
                  : `${dayTotal} ${dayTotal === 1 ? "article" : "articles"}`
                : undefined
            }
            controls={
              <>
                {/* A row per group on a phone. As one sideways row the tier chips sat
                    wholly past the edge whenever the sentiment chips filled the width. */}
                <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <FilterChipRow>
                    <SentimentFilterChips
                      total={dayArticles.length}
                      counts={bucketCounts}
                      value={sentimentFilter}
                      onChange={setSentimentFilter}
                    />
                  </FilterChipRow>
                  <span className="mx-1 hidden h-4 w-px shrink-0 bg-forest-900/15 sm:block" />
                  <FilterChipRow>
                    <TierFilterChips
                      counts={tierCounts(dayArticles)}
                      value={tierFilter}
                      onChange={setTierFilter}
                    />
                  </FilterChipRow>
                </div>
                <SortToggle value={sort} onChange={setSort} />
              </>
            }
          >
            {shown.length === 0 ? (
              <p className="text-sm text-brand-muted-fg italic">
                {dayArticles.length === 0
                  ? `No articles ${activeDay ? dayPhrase(activeDay) : "on this day"}.`
                  : "No articles match the selected filters."}
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
          </EvidenceDayCard>
        </>
      )}
    </div>
  );
}
