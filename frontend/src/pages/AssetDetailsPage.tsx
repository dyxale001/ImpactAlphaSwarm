import { useMemo, useState } from "react";
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
  ArrowRight,
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
import SentimentCalculation from "../components/research/SentimentCalculation";
import { SentimentTrendChart } from "../components/research/SentimentTrendChart";
import { DaySummaryPanel } from "../components/research/DaySummaryPanel";
import { MarketClock } from "../components/research/MarketClock";
import {
  newsDayIndex,
  newsDaysFromHistory,
} from "../components/research/newsDaily";
import {
  sentimentVerdict,
  TONE_ON_FOREST,
  type SentimentTone,
} from "../components/research/sentimentDisplay";
import { useAssetDetails } from "../hooks/useAssetDetails";
import { useSentimentHistory } from "../hooks/useSentimentHistory";
import { HUB_PAGE_LABELS, readLastHubPage } from "../utils/lastHubPage";
import {
  NEWS_LOOKBACK_DAYS,
  NEWS_WEIGHT_PCT,
  SOCIAL_HISTORY_DAYS,
  SOCIAL_LOOKBACK_DAYS,
  SOCIAL_WEIGHT_PCT,
} from "../data/sentimentMethodology";

function formatMetric(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  }
  return String(value);
}

// A score bar anchored at 50, not at 0.
//
// The old bar filled from zero, so 62 drew as a track two thirds full and 38 as a
// track a third full: the encoding said "how much of the maximum" when the number
// means "which side of neutral, and by how far". Growing out from a centre tick makes
// direction the thing the eye reads first, which is the actual question, and it is the
// same convention the trend chart already uses with its dashed neutral 50 line.
function AnchoredBar({
  score,
  tone,
}: {
  score: number | null | undefined;
  tone: SentimentTone;
}) {
  const value =
    typeof score === "number" ? Math.max(0, Math.min(100, score)) : 50;
  const from = Math.min(value, 50);
  const to = Math.max(value, 50);

  return (
    <div
      className="relative h-2 w-full rounded-full overflow-hidden"
      style={{ background: "rgba(255,255,255,0.10)" }}
    >
      {typeof score === "number" && (
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${from}%`,
            width: `${to - from}%`,
            background: TONE_ON_FOREST[tone].fill,
          }}
        />
      )}
      {/* The anchor itself. Without a visible 50 the bar is just an offset block and
          the reader has no reference to measure the direction against. Drawn over the
          fill so it stays findable when the score sits close to neutral. */}
      <div
        className="absolute inset-y-0 w-px"
        style={{ left: "50%", background: "rgba(255,255,255,0.45)" }}
      />
    </div>
  );
}

// One of the two halves of the blended score: what it is, how much of the score it
// carries, where it sits against neutral, and what that means in words.
// It also carries the way through to that signal's own page. The card used to list the
// articles and posts inline, which made it long and duplicated pages that already do
// the job properly.
//
// That route is a named, underlined link saying what it opens, not the row itself with
// a chevron on it. A whole row that happens to navigate is only discoverable by
// hovering it, which never happens on touch and rarely happens on a panel where
// nothing else is interactive: the reader has to already suspect the link is there to
// find it. Naming the destination and the count is what makes it findable.
function ContributorRow({
  label,
  weightPct,
  score,
  rightText,
  to,
  linkText,
}: {
  label: string;
  weightPct: number;
  score: number | null | undefined;
  rightText?: string;
  to: string;
  linkText: string;
}) {
  const verdict = sentimentVerdict(rightText ? null : score);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
          {label}
          <span className="px-1.5 py-0.5 rounded-full bg-lime-500 text-[10px] font-medium text-forest-900">
            {weightPct}%
          </span>
        </span>
        <span className="text-xs whitespace-nowrap">
          {rightText ? (
            <span style={{ color: "rgba(255,255,255,0.55)" }}>{rightText}</span>
          ) : (
            <>
              <span className="font-mono font-semibold tabular-nums text-white">
                {formatMetric(score, 0)}
              </span>{" "}
              <span style={{ color: TONE_ON_FOREST[verdict.tone].text }}>
                {verdict.label}
              </span>
            </>
          )}
        </span>
      </div>
      <AnchoredBar score={rightText ? null : score} tone={verdict.tone} />
      {/* Underlined by default rather than on hover. This is the only route off the
          card to the evidence, so it should read as a link before the pointer arrives
          anywhere near it. */}
      <Link
        to={to}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-lime-500 underline underline-offset-2 decoration-lime-500/50 transition-colors hover:text-lime-400 hover:decoration-lime-400"
      >
        {linkText}
        <ArrowRight className="w-3 h-3 shrink-0" />
      </Link>
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
      className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90"
      title="How is this calculated?"
    >
      <HelpCircle className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">How is this calculated?</span>
      <span className="sm:hidden">How?</span>
    </Link>
  );
}

type AnalysisTab = "ranking" | "sentiment" | "quant";

// The page carried three unrelated arguments stacked vertically: why the asset placed
// where it did, what the sentiment sources say, and what the price history measures.
// Read end to end that is a long scroll in which the reader loses which question they
// were answering, so each gets its own panel and only one is on screen at a time.
function AnalysisTabs({
  value,
  onChange,
  rankingLabel,
}: {
  value: AnalysisTab;
  onChange: (tab: AnalysisTab) => void;
  rankingLabel: string;
}) {
  const tabs: { key: AnalysisTab; label: string }[] = [
    { key: "ranking", label: rankingLabel },
    { key: "sentiment", label: "Sentiment" },
    { key: "quant", label: "Quant" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Analysis sections"
      // self-start, not just inline-flex: the parent is a flex column, and a flex
      // child stretches to the full line width unless told otherwise, which turned
      // the pill into a full page-width bar.
      className="self-start inline-flex items-center rounded-full border border-brand-border/60 bg-brand-bg/55 p-0.5 flex-wrap"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            value === tab.key
              ? "bg-brand-accent text-brand-fg"
              : "text-brand-muted-fg hover:text-brand-fg"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
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
          {/* Same weight as the body text in the panels below, not the muted grey the
              label above it uses. It is a sentence the reader is meant to read, and at
              muted it sat closer to the eyebrow label than to the prose it introduces. */}
          <p className="text-sm text-brand-fg/90">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// The verdict block at the top of the sentiment tab: the blended score as a figure
// worth looking at, with the two signals that make it up beside it.
//
// It replaces three near-identical thin bars. Those gave the headline score exactly
// the same weight as its own components, so nothing anchored the tab, and none of them
// said whether the number was good.
function SentimentVerdict({
  blended,
  newsScore,
  socialScore,
  newsRightText,
  ticker,
  newsCount,
}: {
  blended: number | null | undefined;
  newsScore: number | null | undefined;
  socialScore: number | null | undefined;
  newsRightText?: string;
  ticker: string;
  newsCount?: number;
}) {
  const verdict = sentimentVerdict(blended);
  return (
    // The same forest panel the trend chart sits on. The verdict and the week it came
    // from are one argument, and giving them one ground is what stops the top of the
    // tab reading as a light box with an unrelated dark box under it.
    <div className="hero-card p-5 flex flex-col gap-5 sm:flex-row sm:items-center">
      {/* The figure, in the signature lime. It is the one number the whole tab exists
          to deliver, and at brand-fg on a light card it looked like every other
          number on the page. */}
      <div className="sm:w-44 shrink-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-5xl font-bold tabular-nums text-lime-500 leading-none">
            {formatMetric(blended, 0)}
          </span>
          <span
            className="text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            / 100
          </span>
        </div>
        <p
          className="text-sm font-semibold mt-2"
          style={{ color: TONE_ON_FOREST[verdict.tone].text }}
        >
          {verdict.label}
        </p>
        <p
          className="text-[10px] uppercase tracking-widest font-semibold mt-1"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Blended sentiment
        </p>
      </div>

      <div className="flex-1 min-w-0 space-y-3.5">
        <ContributorRow
          label="News"
          weightPct={NEWS_WEIGHT_PCT}
          score={newsScore}
          rightText={newsRightText}
          to={`/asset/${ticker}/news`}
          // The count is worth naming: it tells the reader how much is behind the
          // link, which is the difference between an invitation and a bare label.
          linkText={
            newsCount
              ? `Read all ${newsCount} articles`
              : "Read the news breakdown"
          }
        />
        <ContributorRow
          label="Social"
          weightPct={SOCIAL_WEIGHT_PCT}
          score={socialScore}
          to={`/asset/${ticker}/social`}
          // No count here. The card only ever holds a capped handful of posts, and the
          // real per-day totals live on the page this links to, so any number quoted
          // from here would be describing the wrong thing.
          linkText="Read every post, day by day"
        />
      </div>
    </div>
  );
}

export default function AssetDetailsPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { asset, recommendation, isLoading, latestRunCreatedAt } =
    useAssetDetails(ticker);

  // Read once per mount, not on every render: it only changes by navigating to a
  // different hub page, which unmounts this page anyway.
  const [backTo] = useState(readLastHubPage);

  // Called before the early returns below, as every hook must be. The history loads
  // independently of the AI run, so the card renders without waiting on it and the
  // chart fills itself in when the series arrives.
  const history = useSentimentHistory(ticker);
  const [tab, setTab] = useState<AnalysisTab>("ranking");

  // Per-day news for the chart's second line: the history the backend stored where it
  // has any, and only otherwise the figure derived here from the run's article list.
  //
  // Preferring the stored series is the point of migrations/021. The derivation is a
  // workaround that weights by an influence computed across the whole window, rewrites
  // its own past whenever a run fetches a different set of articles, and cannot reach
  // beyond the news lookback. It stays as the fallback because NEWS_HISTORY_ENABLED
  // starts off, so a deployment that has not run the migration still gets a news line
  // rather than losing one it already had.
  const newsDays = useMemo(() => {
    const stored = newsDaysFromHistory(history.points);
    return stored.size > 0
      ? stored
      : newsDayIndex(recommendation?.news_articles);
  }, [history.points, recommendation?.news_articles]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Default to the most recent day that carries anything at all, the same rule the
  // social page uses. Not simply the last day in the window: if nothing has been
  // collected today the summary panel would open on an empty day and let a reader
  // conclude the asset has gone quiet.
  //
  // Wider than the social page's test, because this panel covers both signals. A day
  // with five articles and no chatter has plenty to say, and gating on posts alone
  // would skip past it on exactly the assets nobody posts about.
  const defaultDay = useMemo(() => {
    const withData = history.points.filter(
      (p) => p.post_count > 0 || (newsDays.get(p.date)?.count ?? 0) > 0,
    );
    return withData[withData.length - 1]?.date ?? null;
  }, [history.points, newsDays]);

  const activeDay = selectedDay ?? defaultDay;
  const activePoint = history.points.find((p) => p.date === activeDay);

  if (isLoading) {
    return <AssetDetailsSkeleton />;
  }

  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] space-y-4">
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
      "Ranked lower because there is relatively little to go on: fewer trusted articles, posts or days of price history than for other candidates. That reflects what we know, not the asset itself.",
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
    <div className="max-w-5xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-8 animate-fade-in-up">
      <Link
        to={backTo}
        className="text-sm font-semibold text-brand-muted-fg hover:text-brand-fg flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {HUB_PAGE_LABELS[backTo]}
      </Link>

      <div className="flex flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl lg:text-4xl font-bold text-brand-fg">{asset.ticker}</h1>
            <span className="px-3 py-1 bg-accent/95 rounded-full text-xs font-mono text-primary max-w-full truncate">
              {asset.name}
            </span>
            {/* Right aligned from sm up, so on a wide header it reads as a status strip
                opposite the ticker. On a phone it wraps onto its own line under the name
                instead of being squeezed against it. */}
            <div className="w-full sm:w-auto sm:ml-auto">
              <MarketClock />
            </div>
          </div>
          {/* Guarded: `recommendation` is nullable (see the checks below and the
              optional chaining above), and an asset only has one once it has
              reached a top 5. Dereferencing it here crashed the whole page for
              every asset that never has — 48 of 88 rows at the time of writing,
              both seeds and discovered names. price_at_run itself can also be null
              when the price lookup fails. */}
          <p className="text-2xl lg:text-3xl font-mono text-brand-fg">
            {typeof recommendation?.price_at_run === "number"
              ? `R ${recommendation.price_at_run.toFixed(2)}`
              : "Price unavailable"}
          </p>
          {/* Same cached one-liner the whale-watching company panel shows, so an
              asset reads the same way wherever you meet it. Absent for assets
              whose description hasn't been generated yet. */}
          {asset.description && (
            <p className="text-sm text-brand-muted-fg leading-relaxed max-w-2xl mt-3">
              {asset.description}
            </p>
          )}
        </div>

        {recommendation ? (
          <AnalysisTabs
            value={tab}
            onChange={setTab}
            rankingLabel={showScorecard ? "Why it ranks here" : "Assessment"}
          />
        ) : null}
      </div>

      {/* The three panels are siblings at page level so the gap under the tab bar is
          the same whichever one is showing. Nested one level deeper, ranking sat in
          the header's flex gap and the other two in the page's, and the spacing
          jumped as you switched tabs. */}
      {recommendation && tab === "ranking" ? (
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
                  <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
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
                    <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4 space-y-3">
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
                    <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4 space-y-3">
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
        ) : null}

      {!recommendation && (
        <div className="soft-card w-full p-5">
          <p className="text-brand-muted-fg text-sm italic">
            No recent AI analysis found for this asset.
          </p>
        </div>
      )}

      {recommendation && tab === "sentiment" && (
        <>
          <SectionCard
            title="Sentiment Data"
            description={`A blend of trusted financial news from the past ${NEWS_LOOKBACK_DAYS} days and social posts from the past ${SOCIAL_LOOKBACK_DAYS} days. News is weighted higher, so it moves the score more than social.`}
            icon={MessageSquare}
            badge={
              <span
                className="normal-case tracking-normal px-1.5 py-0.5 rounded-full bg-brand-accent text-brand-fg font-medium"
                title={`News from the last ${NEWS_LOOKBACK_DAYS} days and social posts from the last ${SOCIAL_LOOKBACK_DAYS} days. Older items are not counted at all. The trend chart covers a longer window than the score does, because history is filled in outside the run.`}
              >
                News {NEWS_LOOKBACK_DAYS}d · social {SOCIAL_LOOKBACK_DAYS}d
              </span>
            }
            action={
              <ExplainerLink ticker={asset.ticker} section="sentiment" />
            }
          >
            {/* One wrapper, so this card controls its own spacing. Handing SectionCard
                a flat list of children put every one of them on the card's uniform
                space-y-4: the headline score, the working panel, both sub-signals and
                the sources row all sat exactly as far apart as each other, and the
                mt-5 / mt-3 written on them to say otherwise never applied, because
                Tailwind's space-y selector outspecifies a plain margin class. With
                nothing spaced by how closely it is related, nothing grouped. */}
            <div className="space-y-5">
              {/* The verdict, then the week, then the evidence for one day of it.
                  The two signals no longer own separate stacked blocks: they are two
                  lines on one chart, and the day you pick on it is what the lists
                  below are about. That is what joins the tab together, and it is only
                  possible because the news lookback and the chart window are both
                  seven days. */}
              <SentimentVerdict
                blended={recommendation.sentiment_score}
                newsScore={
                  recommendation.news_count
                    ? recommendation.news_sentiment_score
                    : null
                }
                newsRightText={
                  recommendation.news_count ? undefined : "No recent news"
                }
                socialScore={
                  recommendation.social_sentiment_score ??
                  recommendation.sentiment_score
                }
                ticker={asset.ticker}
                newsCount={
                  typeof recommendation.news_count === "number"
                    ? recommendation.news_count
                    : undefined
                }
              />

              {/* Outside the forest panel, not inside it: this is a light detail table
                  of a dozen rows, and the disclosure it opens has no business being
                  rendered on a dark ground. It stays directly under the score it
                  derives, which is the only adjacency that matters. */}
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

              {/* Only what nothing else on the card says. The windows are already in
                  the badge and the description above, so repeating them here would be
                  the third telling; what is genuinely new is that the chart reaches
                  further back than the scores do, and that its news line is not the
                  news score the reader just looked at. */}
              <div className="space-y-2">
                <p className="text-[11px] text-brand-muted-fg">
                  The chart covers {SOCIAL_HISTORY_DAYS} days. Its news line is each
                  day's own coverage, not the weighted news score above.
                </p>
                {/* Selecting a day is wired again, and drives the panel below rather
                    than the article and post lists it used to. Those lists were removed
                    because the tab was a stack of everything; a written account of one
                    day is the thing a reader actually wanted from them, and it is one
                    paragraph rather than forty rows. The full lists still live on the
                    news and social pages, a click away. */}
                <SentimentTrendChart
                  points={history.points}
                  daysWithData={history.daysWithData}
                  isLoading={history.isLoading}
                  isSeeding={history.isSeeding}
                  error={history.error}
                  newsDays={newsDays}
                  selectedDay={activeDay}
                  onSelectDay={setSelectedDay}
                  selectHint="Click a day to read what happened"
                />
                {/* Held back until the chart itself has something to show. While the
                    history is loading or still being built the chart draws its own
                    waiting state, and a second panel underneath saying the same thing
                    in different words would read as two separate failures. */}
                {activeDay && !history.isLoading && !history.error && (
                  <DaySummaryPanel
                    ticker={asset.ticker}
                    day={activeDay}
                    point={activePoint}
                    newsDay={newsDays.get(activeDay)}
                  />
                )}
              </div>

              {/* Sources apply to the whole card, not just one signal. On one line at
                  footnote weight: it is provenance, not a fourth signal, and the
                  uppercase label it used to carry gave it the same billing as News
                  and Social. */}
              <div className="pt-3 border-t border-brand-border/50 text-[11px] text-brand-muted-fg">
                Sources:{" "}
                <span className="text-brand-fg font-medium">
                  {recommendation.sources ? String(recommendation.sources) : "—"}
                </span>
              </div>
            </div>
          </SectionCard>
        </>
      )}

      {recommendation && tab === "quant" && (
        <SectionCard
          title="Quantitative Data"
          description="What the price history shows: measurements and peer context, not a recommendation."
          icon={BarChart3}
          action={<ExplainerLink ticker={asset.ticker} section="quant" />}
        >
          <QuantMetricsPanel recommendation={recommendation} />
        </SectionCard>
      )}

      {/* This page had no disclaimer of its own — the only not-advice statement on
          it came from a paragraph repeated under each scorecard. With that removed,
          state it once here, as the dashboard does. */}
      <div className="mt-4 pt-6 border-t border-brand-border/30">
        <p className="text-xs text-brand-muted-fg leading-relaxed">
          <strong className="text-brand-fg">Disclaimer:</strong> every figure on
          this page is a measurement of past and present public data, produced by
          automated analysis for information and education. The ordering reflects
          measurements plus a weighting we choose and disclose. It is not
          professional financial, investment or legal advice, and nothing here
          predicts future prices. All trading involves risk. Please consult a
          licensed financial advisor before making investment decisions.
        </p>
      </div>
    </div>
  );
}