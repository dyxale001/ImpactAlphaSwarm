import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import AssetDetailsSkeleton from "../components/research/AssetDetailsSkeleton";
import {
  SocialPostRow,
  type SocialPost,
} from "../components/research/SocialPosts";
import { SentimentTrendChart } from "../components/research/SentimentTrendChart";
import { dayLabel } from "../components/research/sentimentDays";
import {
  EmptyStateCard,
  SentimentFilterChips,
  SortToggle,
  SourceList,
  SourcePageHeader,
  SummaryStrip,
} from "../components/research/sourcePageControls";
import { useAssetDetails } from "../hooks/useAssetDetails";
import { useSentimentHistory } from "../hooks/useSentimentHistory";
import { SOCIAL_HISTORY_DAYS } from "../data/sentimentMethodology";
import { useSentimentSources } from "../hooks/useSentimentSources";

// Full transparency page for the social side of the sentiment score.
//
// Two granularities, deliberately. The chart is one point per trading day across the
// window; the list underneath is one day's posts. Clicking a bar swaps the list, so
// the two always describe the same day rather than sitting side by side meaning
// different things.
export default function SocialSentimentPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const { asset, recommendation, isLoading } = useAssetDetails(ticker);
  const { points, daysWithData, isLoading: historyLoading, isSeeding, error } =
    useSentimentHistory(ticker);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Default to the most recent day that actually carries posts. Not simply the last
  // day in the window: if the last run was two days ago there is nothing under
  // today's key, and defaulting there would show an empty list and let a reader
  // conclude there is no chatter at all.
  const defaultDay = useMemo(() => {
    const withPosts = points.filter((p) => (p.top_posts?.length ?? 0) > 0);
    return withPosts[withPosts.length - 1]?.date ?? null;
  }, [points]);

  const activeDay = selectedDay ?? defaultDay;
  const activePoint = points.find((p) => p.date === activeDay) ?? null;
  const posts: SocialPost[] = activePoint?.top_posts ?? [];

  const {
    sentimentFilter,
    setSentimentFilter,
    sort,
    setSort,
    bucketCounts,
    shown,
  } = useSentimentSources(posts);

  if (isLoading) return <AssetDetailsSkeleton />;

  const tickerLabel = asset?.ticker ?? ticker?.toUpperCase() ?? "";
  const socialScore =
    activePoint?.score ??
    recommendation?.social_sentiment_score ??
    recommendation?.sentiment_score;

  // The day's real post count, which is not the same as how many we kept. A busy day
  // can score 143 posts while the row holds the top 15, and showing 15 here beside a
  // bar of 143 would make the chart look broken rather than the list look trimmed.
  const dayTotal = activePoint?.post_count ?? posts.length;
  const trimmed = dayTotal > posts.length;

  return (
    <div className="max-w-5xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-6 animate-fade-in-up">
      <SourcePageHeader
        ticker={tickerLabel}
        icon={MessageSquare}
        title="Social Sentiment"
        subtitle={`How retail chatter about ${tickerLabel} moved over the last ${SOCIAL_HISTORY_DAYS} days.`}
      />

      <SentimentTrendChart
        points={points}
        daysWithData={daysWithData}
        isLoading={historyLoading}
        isSeeding={isSeeding}
        error={error}
        selectedDay={activeDay}
        onSelectDay={setSelectedDay}
      />

      {posts.length === 0 ? (
        <EmptyStateCard message="No social posts have been collected for this asset yet." />
      ) : (
        <>
          <SummaryStrip
            pills={[
              {
                label: "Social score",
                value:
                  socialScore != null ? `${Math.round(socialScore)} / 100` : "—",
              },
              {
                label: "Posts",
                value: trimmed ? `${dayTotal} (top ${posts.length} shown)` : dayTotal,
              },
              {
                label: "Bullish posts",
                value: activePoint?.bullish ?? bucketCounts.Positive,
              },
              {
                label: "Bearish posts",
                value: activePoint?.bearish ?? bucketCounts.Negative,
              },
            ]}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SentimentFilterChips
                total={posts.length}
                counts={bucketCounts}
                value={sentimentFilter}
                onChange={setSentimentFilter}
              />
            </div>
            <SortToggle value={sort} onChange={setSort} />
          </div>

          <p className="text-xs text-brand-muted-fg">
            {activeDay ? (
              <>
                Showing the {posts.length} most influential{" "}
                {posts.length === 1 ? "post" : "posts"} from{" "}
                <span className="text-brand-fg font-medium">
                  {dayLabel(activeDay)}
                </span>
                {trimmed ? ` of ${dayTotal} scored that day` : ""}.
              </>
            ) : null}
          </p>

          {shown.length === 0 ? (
            <EmptyStateCard message="No posts match the selected filters." />
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
