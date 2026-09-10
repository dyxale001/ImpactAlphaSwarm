// Plain-language copy for the quant metrics panel on the asset detail page.
// Single source of truth for this wording: the education page (D-083) should
// import from here rather than restating the definitions.
//
// Tone rules (financial-transparency positioning, D-081/D-082): describe what a
// metric measures and what it does NOT tell you; never phrase anything as a
// prediction, a verdict, or a buy/sell cue.

export type SubDimensionKey = "momentum" | "risk_adjusted_return" | "stability";
export type RsiBand = "oversold" | "neutral" | "overbought";
export type BetaBand = "inverse" | "low" | "market" | "high";

export const SUB_DIMENSION_ORDER: SubDimensionKey[] = [
  "momentum",
  "risk_adjusted_return",
  "stability",
];

export const SUB_DIMENSIONS: Record<
  SubDimensionKey,
  { label: string; subtitle: string; detail: string }
> = {
  momentum: {
    label: "Momentum",
    subtitle: "How strongly the price has been trending recently",
    detail:
      "Combines recent trend strength (the MACD histogram) with the total price change over the analysis window, then ranks the result against every other asset in the same run. It describes what the price has already done. It does not predict what it will do next.",
  },
  risk_adjusted_return: {
    label: "Risk-adjusted return",
    subtitle: "How much return the price earned for the ups and downs along the way",
    detail:
      "Based on the Sharpe ratio: the asset's return over the analysis window relative to how bumpy the ride was, ranked against the other assets in the same run. A high rank means the past return came with relatively little turbulence. It says nothing about future returns.",
  },
  stability: {
    label: "Stability",
    subtitle: "How steady the price has been day to day",
    detail:
      "Ranks the asset's price volatility against the other assets in the same run, with steadier prices ranking higher. Stability describes past behaviour. It is not a measure of safety.",
  },
};

// One shared caption instead of repeating the framing under every row: an
// unanchored percentile is exactly the kind of number that fuels analysis
// paralysis.
export const PERCENTILE_CAPTION =
  "Percentiles compare this asset with the other assets analysed in the same run, a position among peers, not a rating.";

// Context metrics are shown as definitional bands only. Both are non-monotonic
// (neither direction is simply "better"), which is why they are never ranked.
export const CONTEXT_METRICS: Record<
  "rsi" | "beta",
  { label: string; detail: string }
> = {
  rsi: {
    label: "RSI",
    detail:
      "RSI (Relative Strength Index) summarises how fast and how far the price has moved recently, on a 0–100 scale. By convention, below 30 is called “oversold” and above 70 “overbought”. These are descriptive labels about recent movement, not signals to buy or sell.",
  },
  beta: {
    label: "Beta",
    detail:
      "Beta measures how much the price tends to move when the overall market (the S&P 500) moves. Around 1.0 means it moves roughly with the market; higher means bigger swings in both directions; lower means smaller ones. It describes market sensitivity, not quality.",
  },
};

export const RSI_BANDS: Record<RsiBand, string> = {
  oversold: "in the conventional oversold range (below 30)",
  neutral: "in the neutral range (30–70)",
  overbought: "in the conventional overbought range (above 70)",
};

export const BETA_BANDS: Record<BetaBand, string> = {
  // A negative beta is genuinely different in kind, not just "low": the asset
  // moved opposite to the market over the window. Calling that "low" stated
  // something untrue, so it gets its own band.
  inverse: "historically moved opposite to the market (below 0)",
  low: "tends to move less than the market (0–0.8)",
  market: "moves roughly with the market (0.8–1.2)",
  high: "tends to move more sharply than the market (above 1.2)",
};

// Raw metric definitions, used as hover titles on the raw-metrics grid.
export const RAW_METRICS: {
  key: string;
  label: string;
  detail: string;
  digits?: number;
}[] = [
  {
    key: "beta",
    label: "Beta",
    detail: CONTEXT_METRICS.beta.detail,
  },
  {
    key: "macd",
    label: "MACD",
    detail:
      "A trend-following indicator: the gap between the short-term and long-term average price. It describes the recent trend, not where the price goes next.",
  },
  {
    key: "macd_histogram",
    label: "MACD histogram",
    detail:
      "How the MACD trend gap has been changing recently: positive means the upward pressure has been strengthening, negative means weakening.",
  },
  {
    key: "rsi",
    label: "RSI",
    detail: CONTEXT_METRICS.rsi.detail,
    digits: 0,
  },
  {
    key: "sharpe_ratio",
    label: "Sharpe ratio",
    detail:
      "Past return relative to volatility over the analysis window: how much return the price earned per unit of turbulence.",
  },
  {
    key: "volatility",
    label: "Volatility",
    detail:
      "How much the daily price moved around its own average over the analysis window (annualised). Movement in either direction counts.",
  },
];

export const MODEL_SCORE_LABEL = "Model quant score, used in today's ranking";

export const MODEL_SCORE_DISCLOSURE =
  "This is the model's own synthesis of the measurements above. It is an input to how your feed is ordered, an editorial judgement, not a measurement.";

export const INSUFFICIENT_UNIVERSE_NOTE =
  "This run analysed too few assets for a fair peer comparison, so percentile ranks aren't shown. The measurements below still apply.";

export const NO_DATA_NOTE =
  "Not enough price history was available for this asset in this run, so the quantitative measurements couldn't be computed.";

// ── D-122: the direction of "good", stated ─────────────────────────────────
//
// A percentile with no stated direction is as opaque as the raw number it replaced.
// "78th percentile" on stability does not say whether that is steady or jumpy, and it
// differs per row: on momentum higher means a stronger trend, on stability higher means
// a calmer price. So every row carries one sentence saying which way is which, and one
// plain reading that turns the ordinal into a comparison a beginner can picture.
//
// Still not a verdict. "Steadier than about 8 in 10 peers" is a fact about the past
// window; whether steadiness is what a reader wants depends on the reader.
export const SUB_DIMENSION_DIRECTION: Record<SubDimensionKey, string> = {
  momentum: "Higher means a stronger recent price trend, in either direction of travel.",
  risk_adjusted_return:
    "Higher means more past return for each unit of turbulence along the way.",
  stability: "Higher means a steadier price from day to day; lower means a jumpier one.",
};

// The word a row uses for "more of this", so the reading below can say what a high
// rank means in this row's own terms.
const SUB_DIMENSION_QUALITY: Record<SubDimensionKey, { high: string; low: string }> = {
  momentum: { high: "a stronger trend", low: "a weaker trend" },
  risk_adjusted_return: {
    high: "more return per unit of turbulence",
    low: "less return per unit of turbulence",
  },
  stability: { high: "a steadier price", low: "a jumpier price" },
};

// "in the 82nd percentile" as something a reader can picture: how many of ten peers
// this asset sat above. Rounded to whole peers; the middle of the pack is named as such
// rather than as "above 5 in 10", which sounds like a claim.
export function percentileReading(key: SubDimensionKey, pctile: number): string {
  const tenths = Math.round(pctile / 10);
  const quality = SUB_DIMENSION_QUALITY[key];
  if (tenths >= 9) return `${quality.high} than nearly every other asset in this run`;
  if (tenths <= 1) return `${quality.low} than nearly every other asset in this run`;
  if (tenths >= 4 && tenths <= 6) return `about the middle of this run's assets`;
  const noun = tenths >= 7 ? quality.high : quality.low;
  const count = tenths >= 7 ? tenths : 10 - tenths;
  return `${noun} than about ${count} in 10 assets in this run`;
}

// One line under each band chip saying what the label means for a reader who has not
// met the term, stated as description rather than as a cue. Both extremes of RSI are
// "notable"; neither is an instruction.
export const RSI_BAND_MEANING: Record<RsiBand, string> = {
  oversold:
    "The price has fallen fast recently by this measure. That is a description of the move, not a sign it will recover.",
  neutral:
    "Recent price moves have been moderate by this measure, neither sharply up nor sharply down.",
  overbought:
    "The price has risen fast recently by this measure. That is a description of the move, not a sign it will fall.",
};

export const BETA_BAND_MEANING: Record<BetaBand, string> = {
  inverse:
    "Over the window this price tended to move opposite to the wider market. Unusual, and worth knowing about, but not a quality in itself.",
  low: "Over the window this price moved less than the wider market did, in both directions.",
  market: "Over the window this price moved roughly in step with the wider market.",
  high: "Over the window this price swung more than the wider market did, in both directions.",
};

// ── The historical window (D-125 horizons) ─────────────────────────────────

export type QuantHorizon = "1M" | "6M" | "3Y" | "5Y";

export const QUANT_HORIZONS: QuantHorizon[] = ["1M", "6M", "3Y", "5Y"];
export const DEFAULT_QUANT_HORIZON: QuantHorizon = "6M";

export const QUANT_HORIZON_LABELS: Record<QuantHorizon, string> = {
  "1M": "the last month",
  "6M": "the last six months",
  "3Y": "the last three years",
  "5Y": "the last five years",
};

// What the chart is and is not. The price line is public closes; the RSI line under it
// is the same arithmetic the run's own reading uses, drawn at every day instead of the
// last one. Neither is a signal to act on.
export const QUANT_CHART_NOTE =
  "Closing prices in the asset's own listing currency, with the RSI reading for each day beneath. Past movement, described; nothing here predicts what comes next.";

export const QUANT_CHART_UNAVAILABLE =
  "The historical view is not switched on for this deployment. The measurements below still describe the most recent analysis.";

export const QUANT_CHART_EMPTY =
  "No price history could be fetched for this asset over this window.";

// The Quant tab's own reasoning trace: what it was written from and what it will not do.
export const QUANT_TRACE_DISCLOSURE =
  "Written from the window's own figures and this asset's stored measurements only. It describes past price behaviour; it does not predict, rate or advise.";
