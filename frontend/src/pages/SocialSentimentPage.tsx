import { useParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import AssetDetailsSkeleton from "../components/research/AssetDetailsSkeleton";
import {
  SocialPostRow,
  type SocialPost,
} from "../components/research/SocialPosts";
import {
  EmptyStateCard,
  SentimentFilterChips,
  SortToggle,
  SourceList,
  SourcePageHeader,
  SummaryStrip,
} from "../components/research/sourcePageControls";
import { useAssetDetails } from "../hooks/useAssetDetails";
import { useSentimentSources } from "../hooks/useSentimentSources";

// Full transparency page for the social side of the sentiment score: every
// StockTwits post the latest AI run used, with sentiment and sort controls.
export default function SocialSentimentPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const { asset, recommendation, isLoading } = useAssetDetails(ticker);

  const posts: SocialPost[] = recommendation?.social_posts ?? [];
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
    recommendation?.social_sentiment_score ?? recommendation?.sentiment_score;

  return (
    <div className="max-w-5xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-6 animate-fade-in-up">
      <SourcePageHeader
        ticker={tickerLabel}
        icon={MessageSquare}
        title="Social Sentiment"
        subtitle={`Every StockTwits post the latest AI run used to score ${tickerLabel}.`}
      />

      {!recommendation || posts.length === 0 ? (
        <EmptyStateCard message="No social posts were used in the latest analysis for this asset." />
      ) : (
        <>
          <SummaryStrip
            pills={[
              {
                label: "Social score",
                value:
                  socialScore != null
                    ? `${Math.round(socialScore)} / 100`
                    : "—",
              },
              { label: "Posts", value: posts.length },
              {
                label: "Bullish posts",
                value: recommendation.bullish_posts ?? bucketCounts.Positive,
              },
              {
                label: "Bearish posts",
                value: recommendation.bearish_posts ?? bucketCounts.Negative,
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
