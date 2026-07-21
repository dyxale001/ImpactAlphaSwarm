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
    <div className="flex items-center justify-between gap-3 font-mono text-[12px] text-brand-fg">
      <span className="text-brand-muted-fg">{label}</span>
      <span className="tabular-nums">
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
  const socialSub = social.reconstructable
    ? social.avg
    : typeof socialScore === "number"
      ? socialScore
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
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary transition-colors hover:text-brand-primary/80"
      >
        <Sigma className="h-3.5 w-3.5" />
        {open ? "Hide the calculation" : "Show how this score was calculated"}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-4 rounded-2xl border border-brand-border/60 bg-brand-bg/40 p-4">
          {/* News sub-score: tier-by-tier. */}
          {hasNews && news.reconstructable && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
                News sub-score, by reliability tier
              </p>
              <div className="space-y-1.5">
                {news.tiers.map((t) => {
                  const meta = tierMeta(t.tier);
                  return (
                    <div
                      key={t.tier}
                      className="flex items-center justify-between gap-3 text-[12px]"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded-full font-medium ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-brand-muted-fg">
                          {t.count} {t.count === 1 ? "article" : "articles"}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-brand-fg">
                        avg {Math.round(t.avg)} &times; {Math.round(t.sharePct)}% ={" "}
                        <span className="font-semibold">
                          {fmt(t.contribution)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-brand-border/50 pt-1.5 text-[12px] font-semibold text-brand-fg">
                <span>News sub-score</span>
                <span className="font-mono tabular-nums">
                  {Math.round(newsSub)} / 100
                </span>
              </div>
              <p className="text-[11px] text-brand-muted-fg">
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
              <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
                Social sub-score
              </p>
              <div className="flex items-center justify-between gap-3 text-[12px] font-semibold text-brand-fg">
                <span className="font-normal text-brand-muted-fg">
                  Engagement- and recency-weighted average of{" "}
                  {socialPosts.length}{" "}
                  {socialPosts.length === 1 ? "post" : "posts"}
                </span>
                <span className="font-mono tabular-nums">
                  {Math.round(socialSub)} / 100
                </span>
              </div>
              <p className="text-[11px] text-brand-muted-fg">
                Posts with more likes and reshares pull the average harder, on a
                log-dampened scale so one viral post cannot dominate. Newer posts
                also count for more. Both are already baked into each post's
                Influence in the list below.
              </p>
            </div>
          )}

          {/* Blend. */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
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
                <p className="text-[11px] text-brand-muted-fg">{blendNote}</p>
              )
            )}
            <div className="flex items-center justify-between gap-3 border-t border-brand-border/50 pt-1.5 text-sm font-semibold text-brand-fg">
              <span>Blended Score</span>
              <span className="font-mono tabular-nums">
                {blendedShown} / 100
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
