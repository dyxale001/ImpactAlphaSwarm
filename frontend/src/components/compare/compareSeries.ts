// One look per column, used everywhere a column is identified: the chart line,
// the swatch in the table header and the swatch in each phone row. Told apart by
// dash pattern as well as colour, so the columns are distinguishable without
// colour vision and in a greyscale print.
//
// All three are drawn on the forest ground (the quant chart's ground), where lime
// and the two light forests read; none of them is a "good" or "bad" colour, and
// the order is the order the user picked, never a ranking.

export interface SeriesStyle {
  stroke: string;
  dash: string | undefined;
  label: string;
}

export const SERIES: SeriesStyle[] = [
  { stroke: "#c7f269", dash: undefined, label: "solid line" }, // lime-500
  { stroke: "#e4ece9", dash: "6 4", label: "dashed line" }, // forest-100
  { stroke: "#9db6af", dash: "2 3", label: "dotted line" }, // forest-300
];

export function seriesFor(index: number): SeriesStyle {
  return SERIES[index % SERIES.length];
}
