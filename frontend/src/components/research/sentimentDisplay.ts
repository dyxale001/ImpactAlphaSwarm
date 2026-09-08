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

// Styling for a per-item sentiment score badge (0-100). Colour tracks the same
// positive / neutral / negative thresholds used to label each article or post.
export function scoreMeta(score: number | null | undefined): {
  cls: string;
} {
  if (score == null) return { cls: "bg-slate-400/15 text-slate-500" };
  if (score >= 55) return { cls: "bg-emerald-500/10 text-emerald-600" };
  if (score <= 45) return { cls: "bg-rose-500/10 text-rose-600" };
  return { cls: "bg-slate-400/15 text-slate-500" };
}

export type SentimentTone = "positive" | "neutral" | "negative";

// A plain-language reading of a 0-100 sentiment score.
//
// "62 / 100" answers almost nothing a reader arrives with. The meaningful point on
// this scale is 50, not 0, so whether 62 is good is genuinely unclear unless you
// already know that, and a bar filling 62% of its track actively suggests the wrong
// mental model. The bands extend the same 45 / 55 split scoreMeta uses for per-item
// badges, so an article badge and a headline verdict can never disagree about which
// side of neutral something sits.
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
