import { useState } from "react";
import { useParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import AssetDetailsSkeleton from "../components/research/AssetDetailsSkeleton";
import {
  SocialPostRow,
  type SocialPost,
} from "../components/research/SocialPosts";
import {
  countsByDay,
  dayLabel,
  latestPostDay,
  postsOnDay,
} from "../components/research/postDays";
import {
  EmptyStateCard,
  FilterChip,
  SentimentFilterChips,
  SortToggle,
  SourceList,
  SourcePageHeader,
  SummaryStrip,
} from "../components/research/sourcePageControls";
import { SentimentTrendChart } from "../components/research/SentimentTrendChart";
import { useAssetDetails } from "../hooks/useAssetDetails";
import { useSentimentHistory } from "../hooks/useSentimentHistory";
import { useSentimentSources } from "../hooks/useSentimentSources";

const HISTORY_DAYS = 7;

// Full transparency page for the social side of the sentiment score: the
// StockTwits posts the latest AI run used, a day at a time, with sentiment and
// sort controls, plus how the score has moved over the past week.
//
// A day at a time, rather than the whole week at once, because a week of a busy
// ticker is hundreds of posts and reading them as one list tells you nothing
// about when anything was said. The chart and the post list are two views of the
// same selected day: clicking a bar moves both.
export default function SocialSentimentPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const { asset, recommendation, isLoading } = useAssetDetails(ticker);
  const history = useSentimentHistory(ticker, HISTORY_DAYS);

  const posts: SocialPost[] = recommendation?.social_posts ?? [];

  // `undefined` means untouched, so the default can follow the posts once they
  // arrive without an effect to sync it; "all" is the explicit whole-week
  // choice, and null within `selectedDay` carries that through to the filters.
  const [dayChoice, setDayChoice] = useState<string | "all" | undefined>();
  const selectedDay =
    dayChoice === undefined
      ? latestPostDay(posts)
      : dayChoice === "all"
        ? null
        : dayChoice;

  const visiblePosts = postsOnDay(posts, selectedDay);
  const perDay = countsByDay(posts);
  // Every day in the window is offered, not only days that carry posts: a quiet
  // day is a real answer, and it matches what the chart draws.
  const days = history.points.map((point) => point.date);

  const {
    sentimentFilter,
    setSentimentFilter,
    sort,
    setSort,
    bucketCounts,
    shown,
  } = useSentimentSources(visiblePosts);

  if (isLoading) return <AssetDetailsSkeleton />;

  const tickerLabel = asset?.ticker ?? ticker?.toUpperCase() ?? "";
  const socialScore =
    recommendation?.social_sentiment_score ?? recommendation?.sentiment_score;


  return (
    <div className="max-w-5xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-6 animate-fade-in-up">
      <SourcePageHeader
        ticker={tickerLabel}
        icon={MessageSquare}
        title="Social Sentiment"
        subtitle={`The StockTwits posts behind ${tickerLabel}'s social score, day by day.`}
      />

      {/* Sits above the run's posts, and outside the empty-state branch below: the
          stored history is worth showing even on a run that collected nothing. */}
      <div className="soft-card w-full p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-muted-fg mb-4">
          Sentiment over the last {HISTORY_DAYS} days
        </h2>
        <SentimentTrendChart
          {...history}
          days={HISTORY_DAYS}
          selectedDay={selectedDay}
          onSelectDay={setDayChoice}
        />

        {/* The chart's selection in text form, for readers who would rather pick
            a day than hit a bar, and so the current selection is always named
            somewhere rather than only implied by a highlighted column. */}
        {days.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {days.map((day) => (
              <FilterChip
                key={day}
                active={selectedDay === day}
                onClick={() => setDayChoice(day)}
                label={dayLabel(day)}
                count={perDay[day] ?? 0}
              />
            ))}
            <FilterChip
              active={selectedDay === null}
              onClick={() => setDayChoice("all")}
              label={`All ${HISTORY_DAYS} days`}
              count={posts.length}
            />
          </div>
        )}
      </div>

      {!recommendation || posts.length === 0 ? (
        <EmptyStateCard message="No social posts were used in the latest analysis for this asset." />
      ) : (
        <>
          {/* The counts follow the selected day, but the score does not: it is the
              run's, over the whole window. A per-day figure exists in the rollups
              the chart plots, and it was deliberately not used here, because a
              day's bucket is scored without time decay and without the metered
              GCP pass. Swapping the two as the selection changed would move the
              number for reasons that have nothing to do with the mood that day. */}
          <SummaryStrip
            pills={[
              {
                label: "Sentiment score (7d)",
                value:
                  socialScore != null
                    ? `${Math.round(socialScore)} / 100`
                    : "—",
              },
              {
                label: selectedDay ? `Posts · ${dayLabel(selectedDay)}` : "Posts",
                value: visiblePosts.length,
              },
              {
                label: "Bullish posts",
                value: selectedDay
                  ? bucketCounts.Positive
                  : (recommendation.bullish_posts ?? bucketCounts.Positive),
              },
              {
                label: "Bearish posts",
                value: selectedDay
                  ? bucketCounts.Negative
                  : (recommendation.bearish_posts ?? bucketCounts.Negative),
              },
            ]}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SentimentFilterChips
                total={visiblePosts.length}
                counts={bucketCounts}
                value={sentimentFilter}
                onChange={setSentimentFilter}
              />
            </div>
            <SortToggle value={sort} onChange={setSort} />
          </div>

          {shown.length === 0 ? (
            <EmptyStateCard
              message={
                visiblePosts.length === 0 && selectedDay
                  ? `No posts on ${dayLabel(selectedDay)}. Pick another day, or show all ${HISTORY_DAYS} days.`
                  : "No posts match the selected filters."
              }
            />
          ) : (
            <SourceList>
              {shown.map((p, i) => (
                <li key={i}>
                  <SocialPostRow post={p} ticker={tickerLabel} clamp={false} />
                </li>
              ))}
            </SourceList>
          )}
        </>
      )}
    </div>
  );
}
