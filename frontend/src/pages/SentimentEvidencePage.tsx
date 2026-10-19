import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquare, Newspaper } from "lucide-react";
import AssetDetailsSkeleton from "../components/research/AssetDetailsSkeleton";
import NewsEvidencePanel from "../components/research/NewsEvidencePanel";
import SocialEvidencePanel from "../components/research/SocialEvidencePanel";
import LearnPopover from "../components/learning/LearnPopover";
import { useAssetDetails } from "../hooks/useAssetDetails";
import { useSentimentHistory } from "../hooks/useSentimentHistory";
import { SOCIAL_HISTORY_DAYS } from "../data/sentimentMethodology";

export type EvidenceSource = "news" | "social";

const TABS: { key: EvidenceSource; label: string; icon: typeof Newspaper }[] = [
  { key: "news", label: "News", icon: Newspaper },
  { key: "social", label: "Social", icon: MessageSquare },
];

// The articles and posts behind a stock's sentiment score, on one page with a tab
// per source. /asset/:ticker/news and /asset/:ticker/social both land here on their
// own tab, so the sentiment tab's two links keep working, and switching tabs moves
// the address with it so the back button and shared links still mean one tab.
export default function SentimentEvidencePage({ source }: { source: EvidenceSource }) {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { asset, recommendation, isLoading } = useAssetDetails(ticker);
  const history = useSentimentHistory(ticker);

  if (isLoading) return <AssetDetailsSkeleton />;

  const tickerLabel = asset?.ticker ?? ticker?.toUpperCase() ?? "";

  return (
    <div className="max-w-7xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-6 animate-fade-in-up">
      <Link
        to={`/asset/${tickerLabel}?tab=sentiment`}
        className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg inline-flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {tickerLabel}
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em] text-forest-900">
            {tickerLabel} sentiment evidence
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted-fg">
            The articles and posts behind {tickerLabel}'s sentiment score, day by day for
            the last {SOCIAL_HISTORY_DAYS} days. Choose a day on the chart to read it.
          </p>
        </div>
        <LearnPopover
          context={source === "news" ? "stock.news-sentiment" : "stock.social-sentiment"}
          className="shrink-0"
        />
      </header>

      <div
        role="tablist"
        aria-label="Evidence source"
        className="as-tabs grid w-full grid-cols-2 rounded-[20px] sm:inline-flex sm:w-auto sm:rounded-full"
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={source === key}
            onClick={() => navigate(`/asset/${tickerLabel}/${key}`, { replace: true })}
            className="as-tab"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {source === "news" ? (
        <NewsEvidencePanel recommendation={recommendation} history={history} />
      ) : (
        <SocialEvidencePanel ticker={tickerLabel} history={history} />
      )}
    </div>
  );
}
