// Constants describing how the sentiment score is derived. These mirror the
// backend sentiment scout defaults (backend/src/agents/sentiment_scout.py) so the
// "How it works" explanation stays in sync with the real pipeline. Keep these in
// step with NEWS_SENTIMENT_WEIGHT, NEWS_TIER{n}_SHARE and NEWS_RECENCY_HALFLIFE_DAYS.

// Blend weights: news is weighted higher than social chatter.
export const NEWS_WEIGHT_PCT = 70;
export const SOCIAL_WEIGHT_PCT = 100 - NEWS_WEIGHT_PCT;

// Half-life (days) for recency decay applied within each news tier.
export const RECENCY_HALFLIFE_DAYS = 2;

// Lookback window for the news pull.
export const NEWS_LOOKBACK_DAYS = 7;

export type NewsTier = {
  tier: 1 | 2 | 3;
  label: string;
  examples: string;
  // Fixed cross-tier share of the news sub-score (renormalized over tiers present).
  sharePct: number;
  // Tailwind classes for the tier badge, matching the asset details page.
  badgeCls: string;
};

export const NEWS_TIERS: NewsTier[] = [
  {
    tier: 1,
    label: "Newswires & papers of record",
    examples: "Reuters, Bloomberg, WSJ, FT, CNBC, AP",
    sharePct: 60,
    badgeCls: "bg-emerald-500/10 text-emerald-600",
  },
  {
    tier: 2,
    label: "Reputable secondary outlets",
    examples: "Yahoo Finance, Forbes, Business Insider",
    sharePct: 30,
    badgeCls: "bg-amber-500/10 text-amber-600",
  },
  {
    tier: 3,
    label: "Crowd-sourced analysis",
    examples: "Seeking Alpha, The Motley Fool",
    sharePct: 10,
    badgeCls: "bg-slate-400/15 text-slate-500",
  },
];
