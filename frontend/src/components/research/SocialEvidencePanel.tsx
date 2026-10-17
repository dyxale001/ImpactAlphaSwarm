import { useMemo, useState } from "react";
import { SocialPostRow, type SocialPost } from "./SocialPosts";
import { SentimentTrendChart } from "./SentimentTrendChart";
import { dayLabel, dayPhrase } from "./sentimentDays";
import {
  EmptyStateCard,
  EvidenceDayCard,
  FilterChipRow,
  SentimentFilterChips,
  SortToggle,
  SourceList,
  SummaryStrip,
  VerdictChip,
} from "./sourcePageControls";
import { useSentimentSources } from "../../hooks/useSentimentSources";
import type { useSentimentHistory } from "../../hooks/useSentimentHistory";

// The social side of the sentiment evidence page: the chart is one point per day
// across the window, the list underneath is one day's posts, and choosing a day on
// the chart swaps the list so the two always describe the same day.
export default function SocialEvidencePanel({
  ticker,
  history,
}: {
  ticker: string;
  history: ReturnType<typeof useSentimentHistory>;
}) {
  const { points, daysWithData, isLoading, isSeeding, error } = history;
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Default to the most recent day that actually carries posts, not simply the last
  // day in the window: an empty default list would read as no chatter at all.
  const defaultDay = useMemo(() => {
    const withPosts = points.filter((p) => (p.top_posts?.length ?? 0) > 0);
    return withPosts[withPosts.length - 1]?.date ?? null;
  }, [points]);

  const activeDay = selectedDay ?? defaultDay;
  const activePoint = points.find((p) => p.date === activeDay) ?? null;
  const posts: SocialPost[] = activePoint?.top_posts ?? [];

  const { sentimentFilter, setSentimentFilter, sort, setSort, bucketCounts, shown } =
    useSentimentSources(posts);

  // The selected day's own reading and nothing else, never a fallback to the run's
  // social or blended score labelled as the day's.
  const socialScore = activePoint?.score ?? null;
  // The day's real post count, which is not the same as how many we kept: a busy day
  // can score 143 posts while the row holds the top 15.
  const dayTotal = activePoint?.post_count ?? posts.length;
  const hasAnyPosts = points.some((p) => p.post_count > 0 || (p.top_posts?.length ?? 0) > 0);
  const trimmed = dayTotal > posts.length;

  return (
    <div className="space-y-4">
      <SentimentTrendChart
        points={points}
        daysWithData={daysWithData}
        isLoading={isLoading}
        isSeeding={isSeeding}
        error={error}
        selectedDay={activeDay}
        onSelectDay={setSelectedDay}
      />

      {/* The whole week decides the empty state, not the selected day: a quiet Sunday
          is not "no posts collected for this stock". */}
      {!hasAnyPosts ? (
        <EmptyStateCard message="No social posts have been collected for this stock yet." />
      ) : (
        <>
          <SummaryStrip
            pills={[
              {
                label: "Social score",
                value: socialScore != null ? `${Math.round(socialScore)} / 100` : "—",
                chip: <VerdictChip score={socialScore} />,
              },
              {
                label: "Posts",
                value: dayTotal,
                hint: trimmed ? `Top ${posts.length} shown` : undefined,
              },
              { label: "Bullish posts", value: activePoint?.bullish ?? bucketCounts.Positive },
              { label: "Bearish posts", value: activePoint?.bearish ?? bucketCounts.Negative },
            ]}
          />

          <EvidenceDayCard
            title={activeDay ? dayLabel(activeDay) : "Posts"}
            caption={
              activeDay
                ? trimmed
                  ? `${posts.length} of ${dayTotal} scored posts shown`
                  : `${dayTotal} ${dayTotal === 1 ? "post" : "posts"}`
                : undefined
            }
            controls={
              <>
                <FilterChipRow>
                  <SentimentFilterChips
                    total={posts.length}
                    counts={bucketCounts}
                    value={sentimentFilter}
                    onChange={setSentimentFilter}
                  />
                </FilterChipRow>
                <SortToggle value={sort} onChange={setSort} />
              </>
            }
          >
            {shown.length === 0 ? (
              <p className="text-sm text-brand-muted-fg italic">
                {posts.length === 0
                  ? `No posts ${activeDay ? dayPhrase(activeDay) : "on this day"}.`
                  : "No posts match the selected filters."}
              </p>
            ) : (
              <SourceList nested>
                {shown.map((p, i) => (
                  <li key={i}>
                    <SocialPostRow post={p} ticker={ticker} clamp={false} />
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
