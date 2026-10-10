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
  // Every publisher in the tier, as backend/src/utils/ss_sources.py lists them.
  examples: string;
  // Fixed cross-tier share of the news sub-score (renormalized over tiers present).
  sharePct: number;
};

// Badge colours come from tierMeta (components/research/sentimentDisplay.ts), the
// same pills the article lists use, so a tier looks the same everywhere.
export const NEWS_TIERS: NewsTier[] = [
  {
    tier: 1,
    label: "News wires and papers of record",
    examples:
      "Reuters, Bloomberg, The Wall Street Journal, Financial Times, Associated Press, CNBC, MarketWatch, Barron's, The Economist, Morningstar",
    sharePct: 60,
  },
  {
    tier: 2,
    label: "Reputable secondary outlets",
    examples: "Yahoo Finance, Forbes, Investor's Business Daily, Business Insider",
    sharePct: 30,
  },
  {
    tier: 3,
    label: "Contributor analysis",
    examples: "Seeking Alpha, The Motley Fool",
    sharePct: 10,
  },
];

// The most articles one stock keeps from a single news fetch, most reliable first.
// Mirrors FinnhubSource's limit.
export const NEWS_MAX_ARTICLES = 30;

// How many items per source per run also get the Google Cloud NLP reading. Mirrors
// GCP_SENTIMENT_TOP_N.
export const GCP_TOP_N = 10;

// The score a post gets when its author tagged it Bullish or Bearish themselves:
// MentionScorer.DECLARED_SENTIMENT_SIGNED (0.6) on the 0 to 100 scale.
export const DECLARED_BULLISH_SCORE = 80;
export const DECLARED_BEARISH_SCORE = 20;

// Where one item's label flips: a signed score of 0.05 either side of neutral
// (PayloadBuilder.NEUTRAL_BAND), on the 0 to 100 scale. itemLean uses the same cut.
export const ITEM_POSITIVE_FROM = 52.5;
export const ITEM_NEGATIVE_FROM = 47.5;

// The most an engaged post can count for, as a multiple of a post nobody reacted to.
// Mirrors STOCKTWITS_ENGAGEMENT_CAP.
export const ENGAGEMENT_CAP = 8;

// What a stored day keeps for reading back: SOCIAL_DAY_TOP_POSTS and
// NEWS_DAY_TOP_ARTICLES.
export const DAY_TOP_POSTS = 15;
export const DAY_TOP_ARTICLES = 8;

// The words the card puts on a whole score, for whole numbers. sentimentVerdict
// (components/research/sentimentDisplay.ts) is the rule; a test checks every score
// from 0 to 100 against this table so the explanation cannot drift from the label.
export const VERDICT_BANDS: {
  label: string;
  tone: "positive" | "neutral" | "negative";
  from: number;
  to: number;
}[] = [
  { label: "Strongly positive", tone: "positive", from: 70, to: 100 },
  { label: "Positive", tone: "positive", from: 55, to: 69 },
  { label: "Neutral", tone: "neutral", from: 46, to: 54 },
  { label: "Negative", tone: "negative", from: 31, to: 45 },
  { label: "Strongly negative", tone: "negative", from: 0, to: 30 },
];
