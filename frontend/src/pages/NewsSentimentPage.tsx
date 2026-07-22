import { useParams } from "react-router-dom";
import { Newspaper } from "lucide-react";
import AssetDetailsSkeleton from "../components/research/AssetDetailsSkeleton";
import {
  NewsArticleRow,
  tierCounts,
  type NewsArticle,
} from "../components/research/NewsArticles";
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
import { useSentimentSources } from "../hooks/useSentimentSources";

// Full transparency page for the news side of the sentiment score: every
// article the latest AI run used, with sentiment, tier and sort controls.
export default function NewsSentimentPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const { asset, recommendation, isLoading } = useAssetDetails(ticker);

  const articles: NewsArticle[] = recommendation?.news_articles ?? [];
  const {
    sentimentFilter,
    setSentimentFilter,
    tierFilter,
    setTierFilter,
    sort,
    setSort,
    bucketCounts,
    shown,
  } = useSentimentSources(articles);

  if (isLoading) return <AssetDetailsSkeleton />;

  const tickerLabel = asset?.ticker ?? ticker?.toUpperCase() ?? "";

  return (
    <div className="max-w-5xl mx-auto pt-10 px-8 pb-20 space-y-6 animate-fade-in-up">
      <SourcePageHeader
        ticker={tickerLabel}
        icon={Newspaper}
        title="News Sentiment"
        subtitle={`Every article the latest AI run used to score ${tickerLabel}.`}
      />

      {!recommendation || articles.length === 0 ? (
        <EmptyStateCard message="No news articles were used in the latest analysis for this asset." />
      ) : (
        <>
          <SummaryStrip
            pills={[
              {
                label: "News score",
                value:
                  recommendation.news_sentiment_score != null
                    ? `${Math.round(recommendation.news_sentiment_score)} / 100`
                    : "—",
              },
              { label: "Articles", value: articles.length },
              { label: "Positive", value: bucketCounts.Positive },
              { label: "Negative", value: bucketCounts.Negative },
            ]}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SentimentFilterChips
                total={articles.length}
                counts={bucketCounts}
                value={sentimentFilter}
                onChange={setSentimentFilter}
              />
              <span className="mx-1 h-4 w-px bg-brand-border/60" />
              <TierFilterChips
                counts={tierCounts(articles)}
                value={tierFilter}
                onChange={setTierFilter}
              />
            </div>
            <SortToggle value={sort} onChange={setSort} />
          </div>

          {shown.length === 0 ? (
            <EmptyStateCard message="No articles match the selected filters." />
          ) : (
            <SourceList>
              {shown.map((a, i) => (
                <li key={i}>
                  <NewsArticleRow article={a} clamp={false} />
                </li>
              ))}
            </SourceList>
          )}
        </>
      )}
    </div>
  );
}
