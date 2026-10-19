import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { NewsArticle } from "./NewsArticles";
import type { SocialPost } from "./SocialPosts";
import { tierMeta } from "./sentimentDisplay";
import {
  NEWS_WEIGHT_PCT,
  SOCIAL_WEIGHT_PCT,
  RECENCY_HALFLIFE_DAYS,
} from "../../data/sentimentMethodology";

// Per-asset "show your working" panel. Every number here is reconstructed from
// the SAME per-item figures already listed in the card below (each item's own
// sentiment_score and its influence), so what the reader adds up on screen
// matches the sub-scores shown above, to rounding. No extra data is fetched.
//
// The pipeline it mirrors (backend/src/utils/ss_aggregation.py):
//   * News: articles group by reliability tier; each tier contributes its own
//     recency-weighted average at a fixed cross-tier share. An item's influence
//     already folds in both its tier share and its within-tier recency weight,
//     so summing (score x influence) recovers the tier and news sub-scores.
//   * Social: no tiers, so the sub-score is an engagement- and recency-weighted
//     average of posts (a post's engagement weight is folded into its influence).
//   * Blend: News x 70% + Social x 30%, falling back to whichever source has
//     data, or a neutral 50 when neither does.

type TierBreakdown = {
  tier: 1 | 2 | 3;
  count: number;
  avg: number; // recency-weighted average of this tier's item scores (0-100)
  sharePct: number; // this tier's renormalized share of the news sub-score
  contribution: number; // avg x share -> points added to the news sub-score
};

// Split (score, influence) items by tier and recover each tier's average, share
// and contribution. `total` is the derived sub-score = sum of contributions.
function breakDownByTier(articles: NewsArticle[]): {
  tiers: TierBreakdown[];
  total: number;
  reconstructable: boolean;
} {
  const totalInfluence = articles.reduce((s, a) => s + (a.influence ?? 0), 0);
  // Old cached rows may predate the influence field; without it we can't
  // reconstruct the weighting, so the caller falls back to the stored score.
  if (totalInfluence <= 0)
    return { tiers: [], total: 0, reconstructable: false };

  const tiers: TierBreakdown[] = [];
  for (const tier of [1, 2, 3] as const) {
    const group = articles.filter((a) => a.tier === tier);
    if (group.length === 0) continue;
    const infl = group.reduce((s, a) => s + (a.influence ?? 0), 0);
    if (infl <= 0) continue;
    const avg =
      group.reduce((s, a) => s + (a.sentiment_score ?? 0) * (a.influence ?? 0), 0) /
      infl;
    tiers.push({
      tier,
      count: group.length,
      avg,
      sharePct: infl, // influences already sum to ~100 across all news items
      contribution: (avg * infl) / 100,
    });
  }
  const total = tiers.reduce((s, t) => s + t.contribution, 0);
  return { tiers, total, reconstructable: tiers.length > 0 };
}

// Social has no tiers: the sub-score is the influence-weighted average of the
// posts' own scores, where influence folds in both the post's engagement (likes,
// reshares, replies) and its recency.
function socialAverage(posts: SocialPost[]): {
  avg: number;
  reconstructable: boolean;
} {
  const infl = posts.reduce((s, p) => s + (p.influence ?? 0), 0);
  if (infl <= 0) return { avg: 0, reconstructable: false };
  const avg =
    posts.reduce((s, p) => s + (p.sentiment_score ?? 0) * (p.influence ?? 0), 0) /
    infl;
  return { avg, reconstructable: true };
}

// A "value x weight = product" line multiplies the figures it SHOWS: the value
// rounded to a whole number, times the whole-number percentage. Rounding for display
// but multiplying the unrounded value printed sums a reader could check and find
// wrong ("62 x 70% = 43.1").
export function shownProduct(value: number, pct: number): number {
  return (Math.round(value) * Math.round(pct)) / 100;
}

function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

export default function SentimentCalculation({
  newsArticles,
  socialPosts,
  newsScore,
  socialScore,
  blendedScore,
  newsCarried = null,
}: {
  newsArticles: NewsArticle[];
  socialPosts: SocialPost[];
  newsScore?: number | null;
  socialScore?: number | null;
  blendedScore?: number | null;
  /** Set when the news was carried over from an earlier run and so not blended. */
  newsCarried?: { from: string | null } | null;
}) {
  const [open, setOpen] = useState(false);

  const hasNews = newsArticles.length > 0;
  const hasSocial = socialPosts.length > 0;
  if (!hasNews && !hasSocial) return null;
  // Carried-over news is listed for reference but was never in the blend: the score
  // was computed and ranked on before it was added. The working must follow the
  // score, not the card, or it adds up to a number nobody computed.
  const newsInBlend = hasNews && !newsCarried;

  const news = breakDownByTier(newsArticles);
  const social = socialAverage(socialPosts);

  // The stored sub-score where there is one, since that whole number is what the
  // backend actually blended: with it, the blend rows below add up to the stored
  // blended score rather than landing a point off it. The tier rows above it are
  // the working, and agree with it to rounding. Rebuilt from the articles only for
  // rows that never stored a sub-score.
  const newsSub =
    typeof newsScore === "number"
      ? newsScore
      : news.reconstructable
        ? news.total
        : 0;
  // News is still reconstructed from what is on screen, because every article that
  // fed the score is listed. Social is not, and must not be: the row now keeps only
  // the most influential handful of posts, with the full per-day lists on the social
  // page, so rebuilding the average from what is visible would quietly show a wrong
  // number in the one panel whose entire purpose is showing the real working.
  // The stored sub-score is the one computed from every post.
  const socialSub =
    typeof socialScore === "number"
      ? socialScore
      : social.reconstructable
        ? social.avg
        : 0;

  // Mirror backend _blend_sentiment: fall back to whichever source has data.
  let blended: number;
  let blendNote: string | null = null;
  if (newsInBlend && hasSocial) {
    blended =
      (newsSub * NEWS_WEIGHT_PCT + socialSub * SOCIAL_WEIGHT_PCT) / 100;
  } else if (newsInBlend) {
    blended = newsSub;
    blendNote = "Only news had data in this window, so the blended score equals the news sub-score.";
  } else if (hasSocial) {
    blended = socialSub;
    blendNote = newsCarried
      ? "This run found no new articles, so the blended score equals the social sub-score. The news above was carried over from an earlier run for reference and is not part of it."
      : "Only social had data in this window, so the blended score equals the social sub-score.";
  } else {
    blended = 50;
    blendNote =
      "This run found no new articles and no posts, so the blended score sits at the neutral 50. The news above was carried over from an earlier run for reference.";
  }
  const blendedShown =
    typeof blendedScore === "number" ? blendedScore : Math.round(blended);

  const newsPoints = shownProduct(newsSub, NEWS_WEIGHT_PCT);
  const socialPoints = shownProduct(socialSub, SOCIAL_WEIGHT_PCT);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        {open ? "Hide the calculation" : "Show how this score was calculated"}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* The working as the score is built: each source's sub-score side by side,
          then the blend that turns them into the one number at the top of the
          tab, drawn as a bar so the two contributions can be seen adding up. */}
      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {hasNews && news.reconstructable && (
              <div className="as-inset space-y-3 p-4">
                <SubScoreHeading
                  title="News sub-score"
                  caption={
                    newsCarried
                      ? "Carried over from an earlier run, so not in the score"
                      : `${NEWS_WEIGHT_PCT}% of the blended score`
                  }
                  value={newsSub}
                />
                <ul className="space-y-2.5">
                  {news.tiers.map((t) => {
                    const meta = tierMeta(t.tier);
                    return (
                      <li key={t.tier} className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
                          <span className="flex items-center gap-2">
                            <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
                              {meta.label}
                            </span>
                            <span className="text-brand-muted-fg">
                              {t.count} {t.count === 1 ? "article" : "articles"}
                            </span>
                          </span>
                          {/* nowrap so the sum stays one readable formula rather than
                              splitting after the "=" on a phone. */}
                          <span className="whitespace-nowrap tabular-nums text-brand-muted-fg">
                            avg {Math.round(t.avg)} &times; {Math.round(t.sharePct)}% ={" "}
                            <span className="font-bold text-forest-900">
                              {fmt(shownProduct(t.avg, t.sharePct))}
                            </span>
                          </span>
                        </div>
                        {/* The tier's average on the 0 to 100 scale, with the neutral
                            tick, so a reader sees which way each tier leaned. */}
                        <div className="relative h-1.5 w-full rounded-full bg-forest-100" aria-hidden="true">
                          <div className="h-full rounded-full bg-forest-700" style={{ width: `${Math.min(100, Math.max(0, t.avg))}%` }} />
                          <div className="absolute inset-y-[-2px] left-1/2 w-px bg-forest-900/40" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs leading-relaxed text-brand-muted-fg">
                  Each tier adds its own average at a fixed share, so a few trusted
                  wires are not drowned out by many lower-tier pieces. Newer articles
                  count for more within a tier ({RECENCY_HALFLIFE_DAYS}-day half-life).
                  Rounded figures, so the lines add up to within a point.
                </p>
              </div>
            )}

            {hasSocial && (
              <div className="as-inset space-y-3 p-4">
                <SubScoreHeading
                  title="Social sub-score"
                  caption={`${SOCIAL_WEIGHT_PCT}% of the blended score`}
                  value={socialSub}
                />
                <div className="relative h-1.5 w-full rounded-full bg-forest-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-lime-500" style={{ width: `${Math.min(100, Math.max(0, socialSub))}%` }} />
                  <div className="absolute inset-y-[-2px] left-1/2 w-px bg-forest-900/40" />
                </div>
                <p className="text-xs leading-relaxed text-brand-muted-fg">
                  The average of every post scored in the window, where posts with
                  more likes, replies and reshares pull harder, on a scale that
                  flattens so one viral post cannot dominate. Only the most influential
                  posts are listed on this page, so they will not add up to this on
                  their own; every post is on the social sentiment page.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-[16px] border border-forest-900/10 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-forest-900">Blended score</p>
              <p className="text-xs text-brand-muted-fg">
                {newsInBlend && hasSocial
                  ? `News ${NEWS_WEIGHT_PCT}%, social ${SOCIAL_WEIGHT_PCT}%`
                  : "One source only"}
              </p>
            </div>

            {newsInBlend && hasSocial ? (
              <>
                {/* The two contributions laid end to end on the 0 to 100 scale: the
                    filled length is the blended score. */}
                <div
                  className="relative mt-3 flex h-3 w-full overflow-hidden rounded-full bg-forest-100"
                  role="img"
                  aria-label={`News adds ${fmt(newsPoints)} and social adds ${fmt(socialPoints)}, making ${blendedShown} out of 100`}
                >
                  {/* One rounded fill sized to the score, holding both contributions,
                      so the bar ends in a round cap at the score itself. */}
                  <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${Math.min(100, newsPoints + socialPoints)}%` }}>
                    <div className="h-full bg-forest-700" style={{ flexGrow: newsPoints }} />
                    <div className="h-full bg-lime-500" style={{ flexGrow: socialPoints }} />
                  </div>
                  <div className="absolute inset-y-0 left-1/2 w-px bg-forest-900/40" aria-hidden="true" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm tabular-nums text-forest-900">
                  <BlendTerm swatch="bg-forest-700" label="News" score={newsSub} weightPct={NEWS_WEIGHT_PCT} />
                  <span className="text-brand-muted-fg">+</span>
                  <BlendTerm swatch="bg-lime-500" label="Social" score={socialSub} weightPct={SOCIAL_WEIGHT_PCT} />
                  <span className="text-brand-muted-fg">=</span>
                  <BlendResult value={blendedShown} />
                </div>
              </>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                {blendNote && (
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-brand-muted-fg">{blendNote}</p>
                )}
                <BlendResult value={blendedShown} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubScoreHeading({ title, caption, value }: { title: string; caption: string; value: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-forest-900">{title}</p>
        <p className="text-xs text-brand-muted-fg">{caption}</p>
      </div>
      <p className="shrink-0 text-xl font-bold tabular-nums tracking-[-0.01em] text-forest-900">
        {Math.round(value)}
        <span className="text-xs font-semibold text-brand-muted-fg"> / 100</span>
      </p>
    </div>
  );
}

// One "value x weight = points" term of the blend, keyed to its colour in the bar.
function BlendTerm({ swatch, label, score, weightPct }: { swatch: string; label: string; score: number; weightPct: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-forest-50 px-2.5 py-1">
      <span className={`h-2 w-2 rounded-full ${swatch}`} aria-hidden="true" />
      <span className="text-brand-muted-fg">{label}</span>
      {Math.round(score)} &times; {weightPct}% ={" "}
      <span className="font-bold">{fmt(shownProduct(score, weightPct))}</span>
    </span>
  );
}

function BlendResult({ value }: { value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-full bg-forest-700 px-3 py-1 text-white">
      <span className="text-base font-bold tabular-nums text-lime-500">{value}</span>
      <span className="text-xs text-white/70">/ 100</span>
    </span>
  );
}
