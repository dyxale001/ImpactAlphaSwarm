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

// How far back the posts feeding the card's social score reach. Mirrors
// SOCIAL_ACCUMULATE_DAYS on the backend.
//
// Social used to have no bound at all, so a quiet ticker's score could rest on a post
// from months ago while the Sentiment Data card's badge claimed both halves came from
// the last few days. The two windows are genuinely different lengths, so the card
// names each rather than one number standing for both.
export const SOCIAL_LOOKBACK_DAYS = 2;

// How many days the trend chart shows. Mirrors SOCIAL_DISPLAY_DAYS on the backend.
//
// Deliberately not the same number as SOCIAL_LOOKBACK_DAYS above. A run only fetches
// far enough back to build today's bar, because a deep walk on the run's path is what
// cost the first version of this feature ten minutes of an eighteen minute run. The
// chart's depth is filled in out of band instead, so it can be as long as is useful
// without the run paying for it.
export const SOCIAL_HISTORY_DAYS = 7;

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
