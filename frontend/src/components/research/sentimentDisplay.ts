// Shared display helper for the news transparency list on the full analysis
// page. Keeps the reliability-tier styling in one place.

// Filled green pills from the brand's own green family: forest-700 for tier 1,
// then the neon lime-500 accent (the reasoning-trace border, the Discovered tag)
// for tier 2, and the darker "moss" lime-700 for tier 3. Tier 1's ground is dark
// enough to need light text; the two limes take forest text, the same treatment
// every other lime pill in the app uses.
export function tierMeta(tier: number | null | undefined): {
  label: string;
  cls: string;
} {
  switch (tier) {
    case 1:
      return { label: "Tier 1", cls: "bg-brand-primary text-white" };
    case 2:
      return { label: "Tier 2", cls: "bg-brand-accent text-brand-fg" };
    case 3:
      return { label: "Tier 3", cls: "bg-lime-700 text-brand-fg" };
    default:
      return { label: "Other", cls: "bg-slate-400/15 text-slate-500" };
  }
}

export type ItemLean = "Positive" | "Neutral" | "Negative";

// Which way ONE article or post leans: the label the backend gave it. That label is
// what the Positive / Neutral / Negative filters sort by and what the day's bullish
// and bearish totals count, so every per-item mark (the badge colour, the Bullish
// tag) reads it rather than re-cutting the score on its own. They used to cut at
// 45 / 55 while the label cuts at 47.5 / 52.5, so a post scoring 53 sat under the
// Positive filter in a grey "Neutral" badge.
//
// An item without a label falls back to the backend's own cut, a signed score of
// 0.05 either side of neutral, which is 52.5 / 47.5 on this scale.
export function itemLean(
  sentiment: string | null | undefined,
  score: number | null | undefined,
): ItemLean | null {
  if (sentiment === "Positive" || sentiment === "Neutral" || sentiment === "Negative") {
    return sentiment;
  }
  if (score == null) return null;
  if (score >= 52.5) return "Positive";
  if (score <= 47.5) return "Negative";
  return "Neutral";
}

// Styling for a per-item sentiment score badge (0-100), coloured by the item's lean.
export function scoreMeta(
  score: number | null | undefined,
  sentiment?: string | null,
): {
  cls: string;
} {
  const lean = itemLean(sentiment, score);
  if (lean === "Positive") return { cls: "bg-emerald-500/10 text-emerald-600" };
  if (lean === "Negative") return { cls: "bg-rose-500/10 text-rose-600" };
  return { cls: "bg-slate-400/15 text-slate-500" };
}

export type SentimentTone = "positive" | "neutral" | "negative";

// A plain-language reading of a 0-100 sentiment score.
//
// "62 / 100" answers almost nothing a reader arrives with. The meaningful point on
// this scale is 50, not 0, so whether 62 is good is genuinely unclear unless you
// already know that, and a bar filling 62% of its track actively suggests the wrong
// mental model.
//
// This is for AGGREGATE scores (a day, a sub-score, the blend) and matches the bands
// the backend writes into its paragraphs (day_summary.SCORE_BANDS). A single item's
// lean is a different question with a tighter cut, answered by itemLean above.
export function sentimentVerdict(score: number | null | undefined): {
  label: string;
  tone: SentimentTone;
} {
  if (score == null) return { label: "No data", tone: "neutral" };
  if (score >= 70) return { label: "Strongly positive", tone: "positive" };
  if (score >= 55) return { label: "Positive", tone: "positive" };
  if (score > 45) return { label: "Neutral", tone: "neutral" };
  if (score > 30) return { label: "Negative", tone: "negative" };
  return { label: "Strongly negative", tone: "negative" };
}

// Tone colours for the verdict panel, which sits on the forest ground.
//
// Hex rather than utility classes, for the same reason the trend chart uses hex: these
// are read against forest-700, where the palette's own semantic colours are mixed for
// a light page and come out muddy. The fills are --color-success and --color-danger
// unchanged, since a solid block carries them fine; the text tones are those same
// hues lifted until they clear the dark ground, and neutral is forest's own 300 / 400
// rather than a grey borrowed from outside the brand.
export const TONE_ON_FOREST: Record<
  SentimentTone,
  { text: string; fill: string }
> = {
  positive: { text: "#7ddba0", fill: "#4fb970" },
  neutral: { text: "#9db6af", fill: "#6a8b82" },
  negative: { text: "#f0918f", fill: "#e25757" },
};
