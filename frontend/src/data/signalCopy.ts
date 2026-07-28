// Copy for the Signal Scorecard — the disclosed replacement for the 0-100
// "Confidence Score" (UNIFIED_SCORING_PLAN.md §4).
//
// Centralised here for the same reason as quantExplainers.ts: the Learning Centre
// (D-083) should import these definitions rather than duplicate them, and every
// surface must describe a factor identically.
//
// House rule for all wording below: describe what was MEASURED and what it means
// for placement in the list. Never a verdict on the asset, never a forward-looking
// claim (D-081 forbids prescription; D-082 positions this as information).

export type ConvergenceState =
  | "agree_strongly"
  | "lean_together"
  | "mixed"
  | "conflict";

/** Headline shown in place of the old score. Deliberately a STATE, not a number:
 *  a single figure invites "how good is it?", which is the reading the pivot
 *  removes. */
export const CONVERGENCE_HEADLINE: Record<ConvergenceState, string> = {
  agree_strongly: "Signals agree strongly",
  lean_together: "Signals lean the same way",
  mixed: "Signals only partly agree",
  conflict: "Signals conflict",
};

export const CONVERGENCE_DETAIL: Record<ConvergenceState, string> = {
  agree_strongly:
    "The price data and the news/social tone point in the same direction. Agreement between two independent signals is what moves an asset up this list — it is not a prediction.",
  lean_together:
    "The price data and the news/social tone broadly agree, with some difference between them.",
  mixed:
    "The price data and the news/social tone only partly agree, so this asset sits lower than its individual readings alone would suggest.",
  conflict:
    "The price data and the news/social tone contradict each other — for example strong online enthusiasm alongside weak price measurements. Worth looking closer before drawing conclusions.",
};

/** Neutral chip styling per state. Amber for conflict is a CAUTION about our own
 *  confidence, not a sell signal; the others stay deliberately muted so the card
 *  never reads as a traffic light. */
export const CONVERGENCE_TONE: Record<ConvergenceState, string> = {
  agree_strongly: "bg-brand-primary/15 text-brand-primary",
  lean_together: "bg-brand-primary/10 text-brand-primary",
  mixed: "bg-slate-500/15 text-slate-400",
  conflict: "bg-semantic-warning/15 text-semantic-warning",
};

export type TermKey =
  | "signal_strength"
  | "convergence"
  | "data_sufficiency"
  | "profile_fit";

export const TERM_COPY: Record<
  TermKey,
  { label: string; question: string; detail: string }
> = {
  signal_strength: {
    label: "Signal strength",
    question: "How strongly do the measurements lean?",
    detail:
      "How far the combined price and tone measurements sit from neutral. A high reading means the inputs are saying something definite; a low one means they are close to neutral. Direction is shown separately — strength alone says nothing about which way.",
  },
  convergence: {
    label: "Agreement",
    question: "Do the two signals agree?",
    detail:
      "Whether the price data and the news/social tone point the same way. Two independent signals agreeing carries more weight than either alone, so disagreement moves an asset down the list — and is shown to you rather than hidden.",
  },
  data_sufficiency: {
    label: "Evidence depth",
    question: "Is there enough to go on?",
    detail:
      "How much material this reading is based on: trusted news articles, social posts and days of price history. A thin reading is ranked lower on purpose — not because the asset is worse, but because we know less about it.",
  },
  profile_fit: {
    label: "Fit with your profile",
    question: "Does it match what you told us?",
    detail:
      "How the asset's market volatility compares with the risk preference you set during onboarding. This only ever moves an asset DOWN when it is more volatile than you asked for; it never promotes anything. It reflects your own stated preference, not a view on the asset.",
  },
};

// A SCORECARD_DISCLOSURE constant lived here and was rendered under every
// scorecard. Removed: repeating it per card buried the four factors it qualified.
// The same points are now made once per page — the objective-vs-editorial split in
// RankingMethodology (linked from each card) and the not-advice statement in the
// page-level disclaimers on the dashboard and asset pages.

export const DIRECTION_COPY: Record<string, string> = {
  favourable: "measurements lean favourable",
  unfavourable: "measurements lean unfavourable",
  neutral: "measurements are close to neutral",
};

/** Why a quant reading might be missing — so "we could not measure this" is never
 *  displayed as though it were "we measured it and it was average". */
export const QUANT_STATE_NOTE: Record<string, string> = {
  insufficient_universe:
    "Too few comparable assets in this run to rank the price data.",
  no_data: "No usable price history was available for this asset.",
  unmeasured: "No price measurement was recorded for this run.",
};
