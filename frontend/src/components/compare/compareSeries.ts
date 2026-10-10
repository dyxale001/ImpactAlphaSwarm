// One look per column, used everywhere a column is identified: the chart lines,
// the swatch in the table header and the swatch in each phone row. Told apart by
// dash pattern as well as colour, so the columns are distinguishable without
// colour vision and in a greyscale print.
//
// All three are drawn on the forest ground (the quant chart's ground), where lime
// and the two light forests read; none of them is a "good" or "bad" colour, and
// the order is the order the user picked, never a ranking.
//
// The values are literal rather than CSS variables because recharts writes them
// into SVG attributes, which do not resolve var(). They are the token values
// (named beside each) and the same ones QuantTrendChart and SentimentTrendChart
// use for this ground, kept here once for both Compare charts.

export interface SeriesStyle {
  stroke: string;
  dash: string | undefined;
  label: string;
}

// ds-allow-hardcode:start SVG attributes cannot read CSS variables; token values named inline
export const SERIES: SeriesStyle[] = [
  { stroke: "#c7f269", dash: undefined, label: "solid line" }, // lime-500
  { stroke: "#e4ece9", dash: "6 4", label: "dashed line" }, // forest-100
  { stroke: "#9db6af", dash: "2 3", label: "dotted line" }, // forest-300
];

/** The forest panel's chart furniture, as on the quant and sentiment charts. */
export const CHART_AXIS_TEXT = "rgba(255,255,255,0.55)";
export const CHART_GRID_LINE = "rgba(255,255,255,0.12)";
export const CHART_NEUTRAL_LINE = "rgba(255,255,255,0.28)";
/** The tooltip and active-dot ring: the panel's own ground, a step below forest-900. */
export const CHART_TOOLTIP_GROUND = "#10221e";
// ds-allow-hardcode:end

export function seriesFor(index: number): SeriesStyle {
  return SERIES[index % SERIES.length];
}
