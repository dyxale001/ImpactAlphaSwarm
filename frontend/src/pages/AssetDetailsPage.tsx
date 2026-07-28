import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  Flame,
  BarChart3,
  MessageSquare,
  TriangleAlert,
  HelpCircle,
  Scale,
} from "lucide-react";
import ConfidenceRing from "../components/dashboard/ConfidenceRing";
import SignalScorecard, {
  type SignalTerms,
} from "../components/dashboard/SignalScorecard";
import { SCORECARD_ENABLED } from "../hooks/useDashboardStats";
import {
  CONVERGENCE_DETAIL,
  QUANT_STATE_NOTE,
  type ConvergenceState,
} from "../data/signalCopy";
import AssetDetailsSkeleton from "../components/research/AssetDetailsSkeleton";
import QuantMetricsPanel from "../components/research/QuantMetricsPanel";
import NewsArticles from "../components/research/NewsArticles";
import SocialPosts from "../components/research/SocialPosts";
import SentimentCalculation from "../components/research/SentimentCalculation";
import { useAssetDetails } from "../hooks/useAssetDetails";
import {
  NEWS_LOOKBACK_DAYS,
  NEWS_WEIGHT_PCT,
  SOCIAL_WEIGHT_PCT,
} from "../data/sentimentMethodology";

function formatMetric(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  }
  return String(value);
}

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

// Each card owns its own explanation. One page-wide "how is this calculated?" made
// the reader hunt for the part that applied to what they were looking at; scoping
// the link to the section is the difference between disclosure and a document dump.
function ExplainerLink({
  ticker,
  section,
}: {
  ticker: string;
  section: "ranking" | "sentiment" | "quant";
}) {
  return (
    <Link
      to={`/asset/${ticker}/how-it-works#${section}`}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-brand-border/60 bg-brand-bg/55 px-3 py-1.5 text-xs font-semibold text-brand-primary transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5"
    >
      <HelpCircle className="w-3.5 h-3.5" />
      How is this calculated?
    </Link>
  );
}

function SectionCard({
  title,
  description,
  icon: Icon,
  badge,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  // Optional qualifier shown beside the title, for context that applies to the
  // whole card (e.g. the time window a score covers).
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="soft-card w-full p-5 space-y-4 hover:border-brand-primary/30 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1 flex items-center gap-1.5">
            <Icon className="w-3 h-3 text-brand-primary" />
            {title}
            {badge}
          </p>
          <p className="text-sm text-brand-muted-fg">{description}</p>
        </div>
        {action}
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

  // Disclosed ranking factors (migration 010). Absent on legacy rows, which keep
  // the confidence-score display.
  const convergenceState = (recommendation?.convergence_state ??
    null) as ConvergenceState | null;
  const showScorecard =
    SCORECARD_ENABLED &&
    convergenceState !== null &&
    recommendation?.signal_strength != null;

  const signalTerms: SignalTerms = {
    signalStrength: recommendation?.signal_strength ?? null,
    signalDirection: recommendation?.signal_direction ?? null,
    convergence: recommendation?.convergence ?? null,
    convergenceState,
    dataSufficiency: recommendation?.data_sufficiency ?? null,
    profileFit: recommendation?.profile_fit ?? null,
    quantState: recommendation?.quant_state ?? null,
  };

  // Only surface a factor when it actually affected placement. Listing all four
  // every time (including a profile fit of 1.00 that changed nothing) is noise,
  // and noise is what made the old penalty panel unreadable.
  const placementNotes: string[] = [];
  if (convergenceState === "conflict" || convergenceState === "mixed") {
    placementNotes.push(CONVERGENCE_DETAIL[convergenceState]);
  }
  if (
    typeof signalTerms.dataSufficiency === "number" &&
    signalTerms.dataSufficiency < 0.75
  ) {
    placementNotes.push(
      "Ranked lower because there is relatively little to go on — fewer trusted articles, posts or days of price history than for other candidates. That reflects what we know, not the asset itself.",
    );
  }
  if (typeof signalTerms.profileFit === "number" && signalTerms.profileFit < 1) {
    placementNotes.push(
      "Ranked lower for you specifically: it moves more sharply than the risk preference you set during onboarding. Another user with a different preference would see it placed differently.",
    );
  }
  if (signalTerms.quantState && signalTerms.quantState !== "cross_sectional") {
    placementNotes.push(
      QUANT_STATE_NOTE[signalTerms.quantState] ??
        "The price measurements could not be ranked for this run.",
    );
  }
  const needsAttention =
    convergenceState === "conflict" ||
    (typeof signalTerms.dataSufficiency === "number" &&
      signalTerms.dataSufficiency < 0.75);

  return (
    <div className="max-w-5xl mx-auto pt-10 px-8 pb-20 space-y-8 animate-fade-in-up">
      <Link
        to="/dashboard"
        className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold text-brand-fg">{asset.ticker}</h1>
            <span className="px-3 py-1 bg-accent/95 rounded-full text-xs font-mono text-primary">
              {asset.name}
            </span>
          </div>
          {/* Guarded: `recommendation` is nullable (see the checks below and the
              optional chaining above), and an asset only has one once it has
              reached a top 5. Dereferencing it here crashed the whole page for
              every asset that never has — 48 of 88 rows at the time of writing,
              both seeds and discovered names. price_at_run itself can also be null
              when the price lookup fails. */}
          <p className="text-3xl font-mono text-brand-fg">
            {typeof recommendation?.price_at_run === "number"
              ? `R ${recommendation.price_at_run.toFixed(2)}`
              : "Price unavailable"}
          </p>
        </div>

        {recommendation ? (
          <div className="soft-card w-full p-5 space-y-5">
            {/* The top card had no explainer of its own, even though it carries the
                headline judgement. It gets the ranking walkthrough. */}
            <div className="flex items-start justify-between gap-3">
              <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold flex items-center gap-1.5">
                <BrainCircuit className="w-3 h-3 text-brand-primary" />
                {showScorecard ? "Why it ranks here" : "Overall Assessment"}
              </div>
              <ExplainerLink ticker={asset.ticker} section="ranking" />
            </div>

            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              <div className="shrink-0 w-full lg:w-72">
                {showScorecard ? (
                  <SignalScorecard terms={signalTerms} />
                ) : (
                  <ConfidenceRing
                    score={recommendation.confidence_score || 0}
                    label="Confidence Score"
                  />
                )}
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm text-brand-muted-fg">
                    Last AI run:{" "}
                    {latestRunCreatedAt
                      ? new Date(latestRunCreatedAt).toLocaleString()
                      : "—"}
                  </div>
                  {/* The 0-100 chip is only shown under the legacy score. With the
                      disclosed factors there is deliberately no single figure. */}
                  {!showScorecard && (
                    <div className="chip bg-brand-primary/15 text-brand-primary">
                      Score {formatMetric(recommendation.confidence_score)}/100
                    </div>
                  )}
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

                  {/* Under the disclosed factors this panel reports WHY the asset
                      placed where it did. The old version listed the hype and risk
                      penalties — the mechanism convergence replaced — so it
                      described arithmetic that no longer happens. */}
                  {showScorecard ? (
                    <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4 space-y-3">
                      <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold flex items-center gap-1.5">
                        <Scale className="w-3 h-3 text-brand-primary" />
                        What moved this asset
                      </div>

                      {placementNotes.length > 0 ? (
                        <ul className="space-y-2 text-sm text-brand-fg/90">
                          {placementNotes.map((note) => (
                            <li key={note} className="leading-relaxed">
                              {note}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm leading-relaxed text-brand-muted-fg">
                          Nothing stood out: the signals agree, the evidence is
                          reasonably deep, and the volatility matches the risk
                          preference on file.
                        </p>
                      )}

                      {needsAttention && (
                        <div className="flex items-center gap-1.5 px-3 py-2 bg-semantic-warning/10 text-semantic-warning rounded-lg text-xs font-semibold">
                          <TriangleAlert className="w-4 h-4" />
                          Worth a closer look before drawing conclusions
                        </div>
                      )}
                    </div>
                  ) : (
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
                  )}
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
            description={`A blend of trusted financial news and social posts from the past ${NEWS_LOOKBACK_DAYS} days. News is weighted higher, so it moves the score more than social.`}
            icon={MessageSquare}
            badge={
              <span
                className="normal-case tracking-normal px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-medium"
                title={`Every score in this card is calculated from news and posts published in the last ${NEWS_LOOKBACK_DAYS} days. Older items are not counted.`}
              >
                Last {NEWS_LOOKBACK_DAYS} days
              </span>
            }
            action={
              <ExplainerLink ticker={asset.ticker} section="sentiment" />
            }
          >
            {/* Headline: the blended, news-weighted score. */}
            <SignalBar
              label="Blended Score"
              score={recommendation.sentiment_score}
              emphasis
            />

            {/* Collapsible "show your working": the full per-asset derivation,
                reconstructed from the same per-item numbers listed below. */}
            <SentimentCalculation
              newsArticles={recommendation.news_articles ?? []}
              socialPosts={recommendation.social_posts ?? []}
              newsScore={recommendation.news_sentiment_score}
              socialScore={
                recommendation.social_sentiment_score ??
                recommendation.sentiment_score
              }
              blendedScore={recommendation.sentiment_score}
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
                <NewsArticles
                  articles={recommendation.news_articles ?? []}
                  ticker={asset.ticker}
                />
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
                <SocialPosts
                  posts={recommendation.social_posts ?? []}
                  ticker={asset.ticker}
                />
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
            description="What the price history shows — measurements and peer context, not a recommendation."
            icon={BarChart3}
            action={<ExplainerLink ticker={asset.ticker} section="quant" />}
          >
            <QuantMetricsPanel recommendation={recommendation} />
          </SectionCard>
        </>
      )}
    </div>
  );
}