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

type SentimentPost = {
  platform?: string;
  author?: string;
  sentiment?: string;
  content?: string;
  url?: string;
  engagement?: number;
};

type NewsArticle = {
  source?: string;
  title?: string;
  url?: string;
  published_at?: string;
};

type WhaleActivity = {
  institution?: string;
  action?: string;
  value_usd?: number;
  shares?: number;
  filing_date?: string;
  url?: string;
};

function ListItemCard({
  title,
  subtitle,
  description,
  href,
  meta,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  href?: string;
  meta?: React.ReactNode;
}) {
  const card = (
    <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4 space-y-3 hover:border-brand-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-brand-fg truncate">
            {title}
          </div>
          {subtitle ? (
            <div className="text-xs text-brand-muted-fg mt-1">{subtitle}</div>
          ) : null}
        </div>
        {meta ? (
          <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold shrink-0">
            {meta}
          </div>
        ) : null}
      </div>
      {description ? (
        <p className="text-sm text-brand-fg/90 leading-relaxed">
          {description}
        </p>
      ) : null}
    </div>
  );

  if (!href) return card;

  return (
    <a href={href} target="_blank" rel="noreferrer" className="block">
      {card}
    </a>
  );
}

export default function AssetDetailsPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { asset, recommendation, isLoading, latestRunCreatedAt } =
    useAssetDetails(ticker);

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
  const sentimentPosts = (
    (recommendation?.sentiment_articles as SentimentPost[]) ?? []
  )
    .slice()
    .sort(
      (left, right) =>
        Number(right.engagement ?? 0) - Number(left.engagement ?? 0),
    )
    .slice(0, 3);
  const newsArticles = ((recommendation?.news_articles as NewsArticle[]) ?? [])
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.published_at ?? 0).getTime();
      const rightTime = new Date(right.published_at ?? 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 3);
  const whaleActivity = (
    (recommendation?.whale_activity as WhaleActivity[]) ?? []
  )
    .slice()
    .sort(
      (left, right) =>
        Number(right.value_usd ?? 0) - Number(left.value_usd ?? 0),
    )
    .slice(0, 3);

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
            R {recommendation?.price_at_run?.toFixed(2) ?? "—"}
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
                      <span className="text-brand-muted-fg">Hype Penalty</span>
                      <span className="font-semibold text-brand-fg">
                        {formatMetric(hypePenalty)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-brand-muted-fg">Risk Penalty</span>
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
                ></div>
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
          <SectionCard
            title="Sentiment Data"
            description="Social sentiment for this asset."
            icon={MessageSquare}
          >
            <div className="mb-3">
              <div className="flex justify-between">
                <span className="relative group inline-block">
                  <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
                    Confidence
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
                ></div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
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
                value={
                  recommendation.sources ? String(recommendation.sources) : "—"
                }
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1">
                    Top Sentiment Posts
                  </p>
                  <p className="text-sm text-brand-muted-fg">
                    The top most engaged social posts currently influencing this
                    asset.
                  </p>
                </div>
              </div>

              {sentimentPosts.length > 0 ? (
                <div className="grid gap-3">
                  {sentimentPosts.map((post, index) => (
                    <ListItemCard
                      key={`${post.platform ?? "post"}-${post.author ?? index}-${index}`}
                      title={`${post.platform ?? "Social"} • ${post.author ?? "Unknown author"}`}
                      subtitle={`${post.sentiment ?? "Neutral"} • Engagement ${Number(post.engagement ?? 0).toLocaleString()}`}
                      description={post.content ?? "No post content available."}
                      href={post.url}
                      meta={`#${index + 1}`}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-brand-muted-fg">
                  No sentiment posts were stored for this run.
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Top News Articles"
            description="The most relevant news items captured for this asset."
            icon={BarChart3}
          >
            {newsArticles.length > 0 ? (
              <div className="grid gap-3">
                {newsArticles.map((article, index) => (
                  <ListItemCard
                    key={`${article.source ?? "news"}-${article.title ?? index}-${index}`}
                    title={article.title ?? "Untitled article"}
                    subtitle={article.source ?? "Unknown source"}
                    description={
                      article.published_at
                        ? `Published ${new Date(article.published_at).toLocaleString()}`
                        : "Publication time unavailable."
                    }
                    href={article.url}
                    meta={`#${index + 1}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-brand-muted-fg">
                No news articles were stored for this run.
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Whale Watching"
            description="Large institutional moves and filings that may matter for this asset."
            icon={Flame}
          >
            {whaleActivity.length > 0 ? (
              <div className="grid gap-3">
                {whaleActivity.map((entry, index) => (
                  <ListItemCard
                    key={`${entry.institution ?? "whale"}-${entry.filing_date ?? index}-${index}`}
                    title={`${entry.institution ?? "Institution"} • ${entry.action ?? "Activity"}`}
                    subtitle={`Value ${Number(
                      entry.value_usd ?? 0,
                    ).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    })} • Shares ${Number(entry.shares ?? 0).toLocaleString()}`}
                    description={
                      entry.filing_date
                        ? `Filing date: ${entry.filing_date}`
                        : "Filing date unavailable."
                    }
                    href={entry.url}
                    meta={`#${index + 1}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-brand-muted-fg">
                No whale watching notifications were stored for this run.
              </p>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
