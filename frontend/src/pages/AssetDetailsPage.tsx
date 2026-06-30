import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  Flame,
  BarChart3,
  MessageSquare,
  TriangleAlert,
  ExternalLink,
} from "lucide-react";
import ConfidenceRing from "../components/dashboard/ConfidenceRing";
import AssetDetailsSkeleton from "../components/research/AssetDetailsSkeleton";
import { useAssetDetails } from "../hooks/useAssetDetails";

function formatMetric(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  }
  return String(value);
}

// Blend weights, mirroring NEWS_SENTIMENT_WEIGHT in the backend sentiment scout
// (default 0.7). Shown as badges so the blended score is self-explanatory.
const NEWS_WEIGHT_PCT = 70;
const SOCIAL_WEIGHT_PCT = 100 - NEWS_WEIGHT_PCT;

function SignalBar({
  label,
  weightPct,
  score,
  emphasis = false,
  rightText,
}: {
  label: string;
  weightPct?: number;
  score: number | null | undefined;
  emphasis?: boolean;
  rightText?: string;
}) {
  const pct =
    typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  return (
    <div>
      <div className="flex justify-between items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold flex items-center gap-2">
          {label}
          {weightPct != null && (
            <span className="normal-case tracking-normal px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-medium">
              {weightPct}% weight
            </span>
          )}
        </span>
        <span className="text-foreground font-mono font-semibold text-sm whitespace-nowrap">
          {rightText ?? `${formatMetric(score, 0)} / 100`}
        </span>
      </div>
      <div className="h-1.5 w-full bg-background rounded-full overflow-hidden mt-1">
        <div
          className={emphasis ? "h-full bg-primary" : "h-full bg-primary/50"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
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

type NewsArticle = {
  source?: string;
  tier?: number | null;
  date?: string;
  headline?: string;
  url?: string | null;
  sentiment?: string;
};

function tierMeta(tier: number | null | undefined) {
  switch (tier) {
    case 1:
      return { label: "Tier 1", cls: "bg-emerald-500/10 text-emerald-600" };
    case 2:
      return { label: "Tier 2", cls: "bg-amber-500/10 text-amber-600" };
    case 3:
      return { label: "Tier 3", cls: "bg-slate-400/15 text-slate-500" };
    default:
      return { label: "Other", cls: "bg-slate-400/15 text-slate-500" };
  }
}

function sentimentDotCls(sentiment: string | undefined) {
  if (sentiment === "Positive") return "bg-emerald-500";
  if (sentiment === "Negative") return "bg-rose-500";
  return "bg-slate-400";
}

// Per-article transparency list: each article's date, reliability tier,
// publisher, headline and (when available) a link to the source.
function NewsArticles({ articles }: { articles: NewsArticle[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!articles || articles.length === 0) return null;

  const shown = expanded ? articles : articles.slice(0, 5);
  const counts = articles.reduce(
    (acc, a) => {
      const t = a.tier === 1 || a.tier === 2 || a.tier === 3 ? a.tier : 0;
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    },
    {} as Record<number, number>,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
          Articles used ({articles.length})
        </span>
        <span className="text-[11px] text-brand-muted-fg flex items-center gap-2">
          <span className="text-emerald-600 font-medium">
            T1 {counts[1] ?? 0}
          </span>
          <span className="text-amber-600 font-medium">T2 {counts[2] ?? 0}</span>
          <span className="text-slate-500 font-medium">T3 {counts[3] ?? 0}</span>
        </span>
      </div>
      <ul className="divide-y divide-brand-border/40 rounded-2xl border border-brand-border/60 bg-brand-bg/40 overflow-hidden">
        {shown.map((a, i) => {
          const t = tierMeta(a.tier);
          const row = (
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sentimentDotCls(a.sentiment)}`}
                title={a.sentiment}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-brand-fg line-clamp-2">
                  {a.headline || "—"}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-brand-muted-fg">
                  <span className="font-mono">{a.date || "—"}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full font-medium ${t.cls}`}
                  >
                    {t.label}
                  </span>
                  <span className="truncate">{a.source || "—"}</span>
                </div>
              </div>
              {a.url && (
                <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-brand-muted-fg" />
              )}
            </div>
          );
          return (
            <li key={i}>
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block hover:bg-brand-primary/5 transition-colors"
                >
                  {row}
                </a>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {articles.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-brand-primary font-medium hover:underline"
        >
          {expanded ? "Show less" : `Show all ${articles.length}`}
        </button>
      )}
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
    return <AssetDetailsSkeleton />;
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
            description="A blend of trusted financial news and social posts. News is weighted higher, so it moves the score more than social."
            icon={MessageSquare}
          >
            {/* Headline: the blended, news-weighted score. */}
            <SignalBar
              label="Blended Score"
              score={recommendation.sentiment_score}
              emphasis
            />

            <div className="mt-5 space-y-5">
              {/* News sub-signal (weighted higher). */}
              <div className="space-y-2">
                <SignalBar
                  label="News"
                  weightPct={NEWS_WEIGHT_PCT}
                  score={
                    recommendation.news_count
                      ? recommendation.news_sentiment_score
                      : null
                  }
                  rightText={
                    recommendation.news_count ? undefined : "No recent news"
                  }
                />
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
                <NewsArticles articles={recommendation.news_articles ?? []} />
              </div>

              {/* Social sub-signal. */}
              <div className="space-y-2">
                <SignalBar
                  label="Social"
                  weightPct={SOCIAL_WEIGHT_PCT}
                  score={
                    recommendation.social_sentiment_score ??
                    recommendation.sentiment_score
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricPill
                    label="Bullish posts"
                    value={formatMetric(recommendation.bullish_posts, 0)}
                  />
                  <MetricPill
                    label="Bearish posts"
                    value={formatMetric(recommendation.bearish_posts, 0)}
                  />
                </div>
              </div>
            </div>

            {/* Sources apply to the whole card, not just one signal. */}
            <div className="mt-5 pt-3 border-t border-brand-border/50 flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
                Sources
              </span>
              <span className="text-sm font-medium text-brand-fg">
                {recommendation.sources ? String(recommendation.sources) : "—"}
              </span>
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