import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  Flame,
  BarChart3,
  MessageSquare,
  TriangleAlert,
} from "lucide-react";
import ConfidenceRing from "../components/dashboard/ConfidenceRing";
import { useAssetDetails } from "../hooks/useAssetDetails";

function formatMetric(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  }
  return String(value);
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="soft-card w-full p-5 space-y-4 hover:border-brand-primary/30 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1 flex items-center gap-1.5">
            <Icon className="w-3 h-3 text-brand-primary" />
            {title}
          </p>
          <p className="text-sm text-brand-muted-fg">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold text-brand-fg">{value}</div>
    </div>
  );
}

export default function AssetDetailsPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { asset, recommendation, isLoading, latestRunCreatedAt } =
    useAssetDetails(ticker);
  const [previewTab] = useState<"overview">("overview");

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

  const reasoningTrace = recommendation?.reasoning_trace ?? "";
  const hypePenalty = recommendation?.hype_penalty ?? 0;
  const riskPenalty = recommendation?.risk_penalty ?? 0;

  return (
    <div className="max-w-5xl mx-auto pt-10 px-8 pb-20 space-y-8 animate-fade-in-up">
      <button
        onClick={() => navigate(-1)}
        className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold text-brand-fg">{asset.ticker}</h1>
            <span className="px-3 py-1 bg-accent/95 rounded-full text-xs font-mono text-primary">
              {asset.name}
            </span>
          </div>
          <p className="text-3xl font-mono text-brand-fg">
            R {recommendation.price_at_run.toFixed(2)}
          </p>
        </div>

        {recommendation ? (
          <div className="soft-card w-full p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              <div className="shrink-0">
                <ConfidenceRing
                  score={recommendation.confidence_score || 0}
                  label="Confidence Score"
                />
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm text-brand-muted-fg">
                    Last AI run:{" "}
                    {latestRunCreatedAt
                      ? new Date(latestRunCreatedAt).toLocaleString()
                      : "—"}
                  </div>
                  <div className="chip bg-brand-primary/15 text-brand-primary">
                    Score {formatMetric(recommendation.confidence_score)}/100
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4">
                    <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-2 flex items-center gap-1.5">
                      <BrainCircuit className="w-3 h-3 text-brand-primary" />
                      Reasoning Trace
                    </div>
                    <p className="text-sm leading-relaxed text-brand-fg/90">
                      {reasoningTrace || "No reasoning trace available."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4 space-y-3">
                    <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold flex items-center gap-1.5">
                      <Flame className="w-3 h-3 text-brand-primary" />
                      Risk and Hype
                    </div>

                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-brand-muted-fg">Hype penalty</span>
                      <span className="font-semibold text-brand-fg">
                        {formatMetric(hypePenalty)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-brand-muted-fg">Risk penalty</span>
                      <span className="font-semibold text-brand-fg">
                        {formatMetric(riskPenalty)}
                      </span>
                    </div>

                    {(hypePenalty > 0 || riskPenalty > 0) && (
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-semantic-warning/10 text-semantic-warning rounded-lg text-xs font-semibold">
                        <TriangleAlert className="w-4 h-4" />
                        Penalties applied to the final score
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="soft-card w-full p-5">
            <p className="text-brand-muted-fg text-sm italic">
              No recent AI analysis found for this asset.
            </p>
          </div>
        )}
      </div>

      {recommendation && (
        <>
          <SectionCard
            title="Sentiment Data"
            description="Blended news & social sentiment — trusted financial news is weighted higher than social posts."
            icon={MessageSquare}
          >
            <div className="mb-3">
              <div className="flex justify-between">
                <span className="relative group inline-block">
                  <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
                    Blended Score
                  </span>
                </span>
                <span className="text-foreground font-mono font-semibold">
                  {formatMetric(recommendation.sentiment_score, 0)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-background rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-primary flex items-center justify-end pr-2"
                  style={{ width: `${recommendation.sentiment_score ?? 0}%` }}
                >
                </div>
              </div>
            </div>

            {/* News sub-signal (weighted higher in the blended score). */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
                  News
                </span>
                <span className="text-foreground font-mono font-semibold text-sm">
                  {recommendation.news_count
                    ? `${formatMetric(recommendation.news_sentiment_score, 0)}/100`
                    : "No recent news"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricPill
                  label="Articles"
                  value={formatMetric(recommendation.news_count, 0)}
                />
                <MetricPill
                  label="Positive"
                  value={formatMetric(recommendation.news_bullish, 0)}
                />
                <MetricPill
                  label="Negative"
                  value={formatMetric(recommendation.news_bearish, 0)}
                />
              </div>
            </div>

            {/* Social sub-signal. */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
                  Social
                </span>
                <span className="text-foreground font-mono font-semibold text-sm">
                  {formatMetric(
                    recommendation.social_sentiment_score ??
                      recommendation.sentiment_score,
                    0
                  )}
                  /100
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricPill
                  label="Bullish posts"
                  value={formatMetric(recommendation.bullish_posts, 0)}
                />
                <MetricPill
                  label="Bearish posts"
                  value={formatMetric(recommendation.bearish_posts, 0)}
                />
                <MetricPill
                  label="Sources"
                  value={recommendation.sources ? String(recommendation.sources) : "—"}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Quantitative Data"
            description="Technical and risk metrics used by the model."
            icon={BarChart3}
          >
            <div className="mb-3">
              <div className="flex justify-between">
                <span className="relative group inline-block">
                  <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
                    Confidence
                  </span>
                </span>
                <span className="text-foreground font-mono font-semibold">
                  {formatMetric(recommendation.quant_score, 0)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-background rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-primary flex items-center justify-end pr-2"
                  style={{ width: `${recommendation.quant_score ?? 0}%` }}
                >
                </div>
              </div>
            </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricPill
                    label="Beta"
                    value={formatMetric(recommendation.beta)}
                  />
                  <MetricPill
                    label="MACD"
                    value={formatMetric(recommendation.macd)}
                  />
                  <MetricPill
                    label="MACD histogram"
                    value={formatMetric(recommendation.macd_histogram)}
                  />
                  <MetricPill
                    label="RSI"
                    value={formatMetric(recommendation.rsi)}
                  />
                  <MetricPill
                    label="Sharpe ratio"
                    value={formatMetric(recommendation.sharpe_ratio)}
                  />
                  <MetricPill
                    label="Volatility"
                    value={formatMetric(recommendation.volatility)}
                  />
                </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}