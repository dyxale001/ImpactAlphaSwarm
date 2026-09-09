import { useState } from "react";
import { ChevronDown, Sigma } from "lucide-react";
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

function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

// One "value x weight = product" line in the blend equation.
function BlendRow({
  label,
  score,
  weightPct,
}: {
  label: string;
  score: number;
  weightPct: number;
}) {
  return (
    // Wraps rather than squashing: on a phone the label and the sum together are
    // wider than the panel, and a formula broken mid-way across two lines is worse
    // than one sitting on its own line under its label.
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 font-mono text-[12px] text-brand-fg">
      <span className="text-forest-500">{label}</span>
      <span className="tabular-nums whitespace-nowrap">
        {Math.round(score)} &times; {weightPct}% ={" "}
        <span className="font-semibold text-brand-fg">
          {fmt((score * weightPct) / 100)}
        </span>
      </span>
    </div>
  );
}

export default function SentimentCalculation({
  newsArticles,
  socialPosts,
  newsScore,
  socialScore,
  blendedScore,
}: {
  newsArticles: NewsArticle[];
  socialPosts: SocialPost[];
  newsScore?: number | null;
  socialScore?: number | null;
  blendedScore?: number | null;
}) {
  const [open, setOpen] = useState(false);

  const hasNews = newsArticles.length > 0;
  const hasSocial = socialPosts.length > 0;
  if (!hasNews && !hasSocial) return null;

  const news = breakDownByTier(newsArticles);
  const social = socialAverage(socialPosts);

  // Prefer derived numbers (so the visible arithmetic is self-consistent), but
  // fall back to the stored sub-scores for rows we can't reconstruct.
  const newsSub = news.reconstructable
    ? news.total
    : typeof newsScore === "number"
      ? newsScore
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
  if (hasNews && hasSocial) {
    blended =
      (newsSub * NEWS_WEIGHT_PCT + socialSub * SOCIAL_WEIGHT_PCT) / 100;
  } else if (hasNews) {
    blended = newsSub;
    blendNote = "Only news had data in this window, so the blended score equals the news sub-score.";
  } else {
    blended = socialSub;
    blendNote = "Only social had data in this window, so the blended score equals the social sub-score.";
  }
  const blendedShown =
    typeof blendedScore === "number" ? blendedScore : Math.round(blended);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-forest-200 bg-forest-50 px-3 py-1.5 text-xs font-semibold text-forest-700 transition-colors hover:border-lime-500 hover:bg-lime-100"
      >
        <Sigma className="h-3.5 w-3.5" />
        {open ? "Hide the calculation" : "Show how this score was calculated"}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Forest tints rather than the generic card greys this used to borrow. The
          panel is a quiet aside off the main reading line, and forest-50 on
          forest-200 sets it back from the white card without turning it into another
          full-strength surface competing with the lists below. */}
      {open && (
        <div className="mt-3 space-y-4 rounded-2xl border border-forest-200 bg-forest-50 p-4">
          {/* News sub-score: tier-by-tier. */}
          {hasNews && news.reconstructable && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-forest-700 font-semibold">
                News sub-score, by reliability tier
              </p>
              <div className="space-y-1.5">
                {news.tiers.map((t) => {
                  const meta = tierMeta(t.tier);
                  return (
                    <div
                      key={t.tier}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px]"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded-full font-medium ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-forest-500">
                          {t.count} {t.count === 1 ? "article" : "articles"}
                        </span>
                      </span>
                      {/* nowrap so the sum stays one readable formula: it is only a
                          few characters wider than the phone panel, and left to wrap
                          it splits after the "=" with the answer alone on line two. */}
                      <span className="font-mono tabular-nums whitespace-nowrap text-brand-fg">
                        avg {Math.round(t.avg)} &times; {Math.round(t.sharePct)}% ={" "}
                        <span className="font-semibold">
                          {fmt(t.contribution)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-forest-200 pt-1.5 text-[12px] font-semibold text-brand-fg">
                <span>News sub-score</span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  {Math.round(newsSub)} / 100
                </span>
              </div>
              <p className="text-[11px] text-forest-500">
                Each tier contributes its own average at a fixed share, so a few
                trusted wires are not drowned out by a flood of lower-tier
                articles. Within a tier, newer articles count for more on a{" "}
                {RECENCY_HALFLIFE_DAYS}-day half-life; that recency weighting is
                already baked into each article's Influence in the list below.
              </p>
            </div>
          )}

          {/* Social sub-score. */}
          {hasSocial && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-forest-700 font-semibold">
                Social sub-score
              </p>
              {/* A full sentence opposite a figure. Left on one row these two shrink
                  against each other on a phone, wrapping the sentence to four lines
                  and splitting "62 / 100" across two. The figure takes its own line
                  instead, and keeps it whole. */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] font-semibold text-brand-fg">
                <span className="min-w-0 font-normal text-forest-500">
                  Engagement-weighted average of every post scored in the window
                </span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  {Math.round(socialSub)} / 100
                </span>
              </div>
              <p className="text-[11px] text-forest-500">
                Posts with more likes and reshares pull the average harder, on a
                log-dampened scale so one viral post cannot dominate. That is already
                baked into each post's Influence in the list below. Only the most
                influential posts are listed here, so they will not add up to the
                number above on their own; the full day by day lists are on the social
                sentiment page.
              </p>
            </div>
          )}

          {/* Blend. */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-forest-700 font-semibold">
              Blended score
            </p>
            {hasNews && hasSocial ? (
              <div className="space-y-1">
                <BlendRow
                  label="News"
                  score={newsSub}
                  weightPct={NEWS_WEIGHT_PCT}
                />
                <BlendRow
                  label="Social"
                  score={socialSub}
                  weightPct={SOCIAL_WEIGHT_PCT}
                />
              </div>
            ) : (
              blendNote && (
                <p className="text-[11px] text-forest-500">{blendNote}</p>
              )
            )}
            {/* The answer the whole panel is working towards, ruled off in the
                signature lime rather than the same hairline as the intermediate
                sub-totals above it. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-2 border-lime-500 mt-1 pt-2 text-sm font-semibold text-brand-fg">
              <span>Blended Score</span>
              <span className="font-mono tabular-nums whitespace-nowrap">
                {blendedShown} / 100
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
