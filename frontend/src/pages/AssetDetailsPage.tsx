import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  Flame,
  Eye,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import ConfidenceRing from "../components/dashboard/ConfidenceRing";
import DualBar from "../components/dashboard/DualBar";
import { useAssetDetails } from "../hooks/useAssetDetails";

type PreviewTab = "overview" | "sentiment" | "fundamentals" | "hype";

function getPreview(
  recommendation: {
    confidence_score: number;
    sentiment_score: number;
    quant_score: number;
    hype_penalty: number;
    reasoning_trace: string;
  },
  tab: PreviewTab,
) {
  switch (tab) {
    case "sentiment":
      return {
        title: "Market Vibe",
        body:
          recommendation.sentiment_score >= 70
            ? `Strong social momentum. With a score of ${recommendation.sentiment_score}/100, the internet is highly bullish on this asset.`
            : `Neutral chatter. A score of ${recommendation.sentiment_score}/100 indicates balanced or quiet discussion online.`,
      };
    case "fundamentals":
      return {
        title: "Hard Numbers",
        body: `Quantitative Score: ${recommendation.quant_score}/100. Higher quant scores indicate stronger technical signals and healthier financials backing the AI's decision.`,
      };
    case "hype":
      return {
        title: "Hype Check",
        body:
          recommendation.hype_penalty > 0
            ? `Hype Penalty Applied: The AI deducted ${recommendation.hype_penalty} points from the final score because social hype is outpacing the math.`
            : `Clear Signal. No hype penalties were applied (${recommendation.hype_penalty} points deducted).`,
      };
    default:
      return {
        title: "AlphaSwarm Thesis",
        body: recommendation.reasoning_trace,
      };
  }
}

export default function AssetDetailsPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { asset, recommendation, isLoading, latestRunCreatedAt } =
    useAssetDetails(ticker);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("overview");

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-brand-fg">
        Loading asset data...
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <p className="text-brand-fg">Asset not found.</p>
        <button
          onClick={() => navigate(-1)}
          className="text-brand-primary underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const preview = recommendation
    ? getPreview(recommendation, previewTab)
    : { title: "AlphaSwarm Thesis", body: "" };

  return (
    <div className="max-w-5xl mx-auto pt-10 px-8 pb-20 space-y-8 animate-fade-in-up">
      {/* Navigation Header */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Title & Pricing Hero */}
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold text-brand-fg">{asset.ticker}</h1>
            <span className="px-3 py-1 bg-brand-secondary rounded-full text-xs font-mono text-brand-muted-fg">
              {asset.name}
            </span>
          </div>
          <p className="text-3xl font-mono text-brand-fg">
            R {asset.current_price.toFixed(2)}
          </p>
        </div>

        {recommendation && (
          <div className="flex items-start gap-6">
            <ConfidenceRing
              score={recommendation.confidence_score || 0}
              label="Confidence Score"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="text-sm text-brand-muted-fg">
                  Last AI run:{" "}
                  {latestRunCreatedAt
                    ? new Date(latestRunCreatedAt).toLocaleString()
                    : "—"}
                </div>
              </div>

              <div className="mt-4">
                <DualBar
                  sentimentScore={recommendation.sentiment_score || 0}
                  quantitativeScore={recommendation.quant_score || 0}
                />
              </div>

              {recommendation.hype_penalty > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2 mt-3 bg-semantic-warning/10 text-semantic-warning rounded-lg text-xs font-semibold">
                  <Flame className="w-4 h-4" /> Hype Risk
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-full">
        <div className="soft-card w-full p-5 space-y-4 hover:border-brand-primary/30 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1 flex items-center gap-1.5">
                <BrainCircuit className="w-3 h-3 text-brand-primary" />
                AlphaSwarm Thesis
              </p>
              <p className="text-sm text-brand-muted-fg">
                The latest AI reasoning, formatted like the dashboard cards.
              </p>
            </div>
            {recommendation && (
              <div className="chip bg-brand-primary/15 text-brand-primary">
                Score {recommendation.confidence_score}/100
              </div>
            )}
          </div>

          {recommendation && (
            <div className="flex items-center gap-1 bg-brand-bg/60 border border-brand-border/60 rounded-full p-1">
              {[
                {
                  id: "overview" as PreviewTab,
                  label: "Overview",
                  icon: Eye,
                },
                {
                  id: "sentiment" as PreviewTab,
                  label: "Vibe",
                  icon: MessageSquare,
                },
                {
                  id: "fundamentals" as PreviewTab,
                  label: "Numbers",
                  icon: BarChart3,
                },
                { id: "hype" as PreviewTab, label: "Hype", icon: Flame },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPreviewTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-colors ${previewTab === tab.id ? "bg-brand-primary text-brand-bg" : "text-brand-muted-fg hover:text-brand-fg"}`}
                >
                  <tab.icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="bg-brand-bg/50 rounded-2xl p-4 border border-brand-border/50 min-h-22">
            <p className="text-[10px] text-brand-muted-fg uppercase tracking-widest mb-1 font-semibold">
              {preview.title}
            </p>
            {recommendation ? (
              <p className="text-brand-fg/90 leading-relaxed text-sm">
                {preview.body}
              </p>
            ) : (
              <p className="text-brand-muted-fg text-sm italic">
                No recent AI analysis found for this asset.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
