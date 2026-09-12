import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { QuantHistoryPoint, QuantWindowFacts } from "../../services/api/analysis";
import {
  QUANT_CHART_EMPTY,
  QUANT_CHART_NOTE,
  QUANT_CHART_NOTE_RAND,
  QUANT_CHART_UNAVAILABLE,
  QUANT_HORIZONS,
  QUANT_HORIZON_LABELS,
  type QuantHorizon,
} from "../../data/quantExplainers";
import {
  conversionNote,
  formatAxisDate,
  formatChange,
  formatDrawdown,
  formatFullDate,
  formatPrice,
  priceDomain,
  rsiNote,
} from "./quantSeries";

// The Quant tab's historical view: closes over a horizon, with RSI beneath.
//
// Two stacked panels on one forest ground rather than two lines on one plot. A price
// and a 0 to 100 indicator share nothing but their dates, and a second y-axis would
// invite the reader to compare heights that mean nothing to each other and to read
// crossings as events. Splitting them keeps both scales honest; `syncId` keeps a day one
// column across both, so hovering the price shows the RSI it came with.
//
// Same ground and same palette as the sentiment chart: the neon line needs the forest
// behind it, and a reader moving between tabs should meet the same kind of object. RSI
// polarity is read from position against the 30 and 70 lines, never from colour, for
// the same reason the sentiment chart's neutral is a dashed line and not a hue change.

const LINE_COLOR = "#c7f269"; // lime-500, the neon accent
const RSI_LINE_COLOR = "#e4ece9"; // forest-100, the cooler light
const AXIS_TEXT = "rgba(255,255,255,0.55)";
const GRID_LINE = "rgba(255,255,255,0.12)";
const NEUTRAL_LINE = "rgba(255,255,255,0.28)";
// The 30 to 70 band RSI conventionally calls neutral, washed rather than drawn, so a
// day outside it is seen against the ground rather than measured against a line.
const RSI_BAND = "rgba(255,255,255,0.05)";
const AXIS_WIDTH = 44;
const MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const SYNC_ID = "quant-window";

// A window needs a few real days before a line says anything.
const MIN_POINTS_TO_PLOT = 5;

interface Props {
  points: QuantHistoryPoint[];
  facts: QuantWindowFacts | null;
  /** The currency the share trades in, e.g. "USD". */
  currency: string;
  /** The currency the closes are in: rand whenever the rate was available. */
  displayCurrency: string;
  /** Rand per unit of the listing currency the closes were converted at, or null. */
  fxRate: number | null;
  converted: boolean;
  exchangeName: string;
  horizon: QuantHorizon;
  /** False when the deployment has not switched the feature on. */
  available: boolean;
  isLoading: boolean;
  error: string | null;
}

export function QuantTrendChart({
  points,
  facts,
  currency,
  displayCurrency,
  fxRate,
  converted,
  exchangeName,
  horizon,
  available,
  isLoading,
  error,
}: Props) {
  if (isLoading) {
    return <div className="h-72 rounded-lg bg-brand-muted/10 animate-pulse" />;
  }

  if (!available) {
    return (
      <p className="text-sm text-brand-muted-fg py-8 text-center">{QUANT_CHART_UNAVAILABLE}</p>
    );
  }

  if (error) {
    return <p className="text-sm text-brand-muted-fg py-8 text-center">{error}</p>;
  }

  if (points.length < MIN_POINTS_TO_PLOT || !facts) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-brand-fg font-medium">Nothing to plot</p>
        <p className="text-xs text-brand-muted-fg mt-1">{QUANT_CHART_EMPTY}</p>
      </div>
    );
  }

  const domain = priceDomain(points.map((p) => p.close));
  const hasRsi = points.some((p) => p.rsi !== null);

  return (
    <div>
      <div className="hero-card overflow-hidden p-4">
        <WindowStrip
          facts={facts}
          currency={currency}
          displayCurrency={displayCurrency}
          fxRate={fxRate}
          converted={converted}
          exchangeName={exchangeName}
          horizon={horizon}
        />

        {/* Recharts 3 makes the chart keyboard focusable, so a click drew the browser's
            default outline around the plot. Suppressed for pointer focus only; a chart
            you can tab into still needs to say where you are. */}
        <div className="mt-3 [&_*:focus:not(:focus-visible)]:outline-none">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={MARGIN} syncId={SYNC_ID}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => formatAxisDate(d, horizon)}
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  domain={domain}
                  width={AXIS_WIDTH}
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  tickFormatter={(v: number) => compactPrice(v)}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<WindowTooltip currency={displayCurrency} />}
                  cursor={{ stroke: NEUTRAL_LINE }}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke={LINE_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#10221e" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {hasRsi && (
            <div className="h-24 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={MARGIN} syncId={SYNC_ID}>
                  {/* The neutral band first, so the grid and the line sit on it. */}
                  <ReferenceArea y1={30} y2={70} fill={RSI_BAND} stroke="none" />
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[30, 70]}
                    width={AXIS_WIDTH}
                    tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReferenceLine y={50} stroke={NEUTRAL_LINE} strokeDasharray="4 4" />
                  {/* The price panel's tooltip already carries the RSI for the day, so
                      this panel shows only the shared cursor. */}
                  <Tooltip content={() => null} cursor={{ stroke: NEUTRAL_LINE }} />
                  <Line
                    type="monotone"
                    dataKey="rsi"
                    stroke={RSI_LINE_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 2, stroke: "#10221e" }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* A key, inside the panel so each swatch is the colour actually drawn: the
            lime is unreadable on the light page behind this card. */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[11px]"
          style={{ color: AXIS_TEXT }}
        >
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded" style={{ background: LINE_COLOR }} />
            Closing price{displayCurrency === "ZAR" ? " in rand" : displayCurrency ? ` (${displayCurrency})` : ""}
          </span>
          {hasRsi && (
            <span className="flex items-center gap-1.5">
              <svg width="16" height="2" aria-hidden="true">
                <line x1="0" y1="1" x2="16" y2="1" stroke={RSI_LINE_COLOR} strokeWidth="2" strokeDasharray="5 3" />
              </svg>
              RSI, 30 to 70 shaded
            </span>
          )}
        </div>
      </div>
      <p className="text-[11px] text-brand-muted-fg mt-2">
        {displayCurrency === "ZAR" ? QUANT_CHART_NOTE_RAND : QUANT_CHART_NOTE}
      </p>
    </div>
  );
}

// The window's own numbers along the top of the panel: what changed over it, where it
// peaked and troughed, and what it is listed as. Percentages carry no colour. A gain is
// not "good" for a reader who wanted to buy lower, and a chart that paints one green is
// taking a side the product does not take.
function WindowStrip({
  facts,
  currency,
  displayCurrency,
  fxRate,
  converted,
  exchangeName,
  horizon,
}: {
  facts: QuantWindowFacts;
  currency: string;
  displayCurrency: string;
  fxRate: number | null;
  converted: boolean;
  exchangeName: string;
  horizon: QuantHorizon;
}) {
  // What it is and where, then how the numbers got into rand. Two sentences on one
  // line, so "trades in USD" and the rate it was converted at are read together.
  const note = conversionNote(currency, displayCurrency, fxRate, converted);
  const listing = [
    exchangeName ? `Listed on ${exchangeName}` : null,
    currency ? `trades in ${currency === "ZAR" ? "rand" : currency}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const line = [listing ? `${listing}.` : null, note].filter(Boolean).join(" ");

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-2xl font-bold text-brand-accent tabular-nums">
          {formatChange(facts.change_pct)}
        </span>
        <span className="text-xs text-white/70">
          over {QUANT_HORIZON_LABELS[horizon]}, {formatPrice(facts.first_close, displayCurrency)} to{" "}
          {formatPrice(facts.last_close, displayCurrency)}
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/70">
        <div>
          <dt className="inline">High </dt>
          <dd className="inline text-white font-medium">{formatPrice(facts.high, displayCurrency)}</dd>
        </div>
        <div>
          <dt className="inline">Low </dt>
          <dd className="inline text-white font-medium">{formatPrice(facts.low, displayCurrency)}</dd>
        </div>
        <div title="The worst fall from any peak to a later low inside this window.">
          <dt className="inline">Largest fall </dt>
          <dd className="inline text-white font-medium">{formatDrawdown(facts.max_drawdown_pct)}</dd>
        </div>
      </dl>
      {line && (
        <p className="basis-full text-[11px] text-white/60">{line}</p>
      )}
    </div>
  );
}

// Axis ticks in the shortest form that still reads: 1.2k for a four-figure price, two
// decimals below ten, whole numbers otherwise.
function compactPrice(value: number): string {
  if (Math.abs(value) >= 10000) return `${(value / 1000).toFixed(1)}k`;
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function WindowTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: QuantHistoryPoint }>;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const note = rsiNote(point.rsi);
  return (
    <div className="rounded-lg border border-white/15 bg-[#10221e] px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-white">{formatFullDate(point.date)}</p>
      <p className="text-white/80 mt-1">
        Close <span className="text-white font-medium">{formatPrice(point.close, currency)}</span>
      </p>
      {point.rsi !== null && (
        <p className="text-white/80">
          RSI <span className="text-white font-medium">{Math.round(point.rsi)}</span>
          {note && <span className="text-white/60">, {note}</span>}
        </p>
      )}
    </div>
  );
}

// The 1M · 6M · 3Y · 5Y switch. Same pill treatment as the tab bar above it, so the
// two controls on the page read as the same kind of thing.
export function HorizonPicker({
  value,
  onChange,
}: {
  value: QuantHorizon;
  onChange: (horizon: QuantHorizon) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Historical window"
      className="inline-flex items-center rounded-full border border-brand-border/60 bg-brand-bg/55 p-0.5"
    >
      {QUANT_HORIZONS.map((h) => (
        <button
          key={h}
          type="button"
          role="radio"
          aria-checked={value === h}
          onClick={() => onChange(h)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            value === h
              ? "bg-brand-primary text-white"
              : "text-brand-muted-fg hover:text-brand-fg"
          }`}
        >
          {h}
        </button>
      ))}
    </div>
  );
}
