import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import {
  SUB_DIMENSIONS,
  SUB_DIMENSION_ORDER,
  CONTEXT_METRICS,
  RAW_METRICS,
  PERCENTILE_CAPTION,
  // MODEL_SCORE_LABEL / MODEL_SCORE_DISCLOSURE are no longer imported: the
  // composite-score footer they labelled was removed. The constants remain in
  // quantExplainers.ts so reverting this commit restores the footer intact.
  INSUFFICIENT_UNIVERSE_NOTE,
  NO_DATA_NOTE,
  SUB_DIMENSION_DIRECTION,
  RSI_BAND_MEANING,
  BETA_BAND_MEANING,
  percentileReading,
  type SubDimensionKey,
  type RsiBand,
  type BetaBand,
} from "../../data/quantExplainers";

function formatMetric(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  }
  return String(value);
}

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// A position marker on a neutral track — deliberately NOT a fill-up bar. A
// filled bar reads as "score, more = better", which is the covert verdict the
// sub-dimensions exist to avoid. Same reason the marker is a single brand
// colour: no red-to-green gradient.
export function PercentileTrack({ pctile }: { pctile: number }) {
  const pos = Math.max(2, Math.min(98, pctile));
  return (
    <div className="relative h-1.5 w-full bg-forest-200 rounded-full mt-2">
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-brand-primary border-2 border-brand-surface shadow-sm"
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}

function ExplainerBody({ text }: { text: string }) {
  return (
    <p className="rounded-[12px] border border-forest-900/10 bg-white px-3 py-2 text-xs leading-relaxed text-brand-muted-fg">
      {text}
    </p>
  );
}

function InfoToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`What does ${label} measure?`}
      className={`transition-colors ${open ? "text-brand-primary" : "text-brand-muted-fg hover:text-brand-primary"}`}
    >
      <Info className="w-3.5 h-3.5" />
    </button>
  );
}

type Band = { key: string; name: string; range: string; from: number; to: number };

// The conventional ranges, drawn at equal widths: the labels matter, not the scale.
const RSI_SCALE: Band[] = [
  { key: "oversold", name: "Oversold", range: "Below 30", from: 0, to: 30 },
  { key: "neutral", name: "Neutral", range: "30 to 70", from: 30, to: 70 },
  { key: "overbought", name: "Overbought", range: "Above 70", from: 70, to: 100 },
];
const BETA_SCALE: Band[] = [
  { key: "inverse", name: "Opposite", range: "Below 0", from: -1, to: 0 },
  { key: "low", name: "Less", range: "0 to 0.8", from: 0, to: 0.8 },
  { key: "market", name: "In step", range: "0.8 to 1.2", from: 0.8, to: 1.2 },
  { key: "high", name: "More", range: "Above 1.2", from: 1.2, to: 2.5 },
];

// A context reading on its band strip: the stock's band filled, a marker where the
// reading sits inside it, and what the band means. Neutral tones throughout, on
// purpose: colouring "oversold" green would re-encode the buy signal the bands replace.
function BandCard({
  title,
  value,
  reading,
  bands,
  active,
  meaning,
  open,
  onToggle,
  detail,
}: {
  title: string;
  value: string;
  reading: number;
  bands: Band[];
  active: string;
  meaning: string;
  open: boolean;
  onToggle: () => void;
  detail: string;
}) {
  const index = Math.max(0, bands.findIndex((b) => b.key === active));
  const band = bands[index];
  const within = Number.isFinite(reading)
    ? Math.max(0.08, Math.min(0.92, (reading - band.from) / (band.to - band.from)))
    : 0.5;
  const left = ((index + within) / bands.length) * 100;
  return (
    <div className="as-inset flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-forest-900">
          {title}
          <InfoToggle open={open} onToggle={onToggle} label={title} />
        </p>
        <p className="text-xl font-bold tabular-nums text-forest-900">{value}</p>
      </div>
      <div role="img" aria-label={`${title} ${value}: ${band.name}, ${band.range}`}>
        <div className="relative" aria-hidden="true">
          <div className="flex gap-1">
            {bands.map((b, i) => (
              <div
                key={b.key}
                className={`flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-center text-xs font-semibold leading-tight ${
                  i === index ? "bg-forest-700 text-white" : "bg-white text-brand-muted-fg"
                }`}
              >
                {b.name}
              </div>
            ))}
          </div>
          <span
            className="absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-lime-500 ring-2 ring-forest-50"
            style={{ left: `${left}%` }}
          />
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {bands.map((b) => (
            <span key={b.key} className="min-w-0 flex-1 text-center text-xs tabular-nums text-brand-muted-fg">{b.range}</span>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-brand-muted-fg">{meaning}</p>
      {open && <ExplainerBody text={detail} />}
    </div>
  );
}

export default function QuantMetricsPanel({
  recommendation,
}: {
  recommendation: Record<string, any>;
}) {
  // One explainer open at a time keeps the section calm — the reader asked
  // about one thing; don't unfold an encyclopedia.
  const [openExplainer, setOpenExplainer] = useState<string | null>(null);
  const toggle = (key: string) =>
    setOpenExplainer((cur) => (cur === key ? null : key));

  const normalisation: string | null =
    recommendation.quant_normalisation ?? null;
  const subDimValues: Record<SubDimensionKey, number | null> = {
    momentum: recommendation.momentum_pctile ?? null,
    risk_adjusted_return: recommendation.risk_adj_pctile ?? null,
    stability: recommendation.stability_pctile ?? null,
  };
  const rsiBand = (recommendation.rsi_band ?? null) as RsiBand | null;
  const betaBand = (recommendation.beta_band ?? null) as BetaBand | null;

  const hasPercentiles = SUB_DIMENSION_ORDER.some(
    (k) => subDimValues[k] !== null,
  );
  const hasBands = rsiBand !== null || betaBand !== null;
  // Rows written before migration 004 carry none of the new fields; they fall
  // back to the pre-panel layout (raw metrics visible, model score below).
  const isLegacyRow = !hasPercentiles && !hasBands && normalisation === null;

  const [showRaw, setShowRaw] = useState(isLegacyRow);

  return (
    <div className="space-y-6">
      {normalisation === "no_data" && (
        <p className="text-sm text-brand-muted-fg italic">{NO_DATA_NOTE}</p>
      )}

      {hasPercentiles ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-forest-900">Position among peers</h3>
            <p className="mt-0.5 text-xs text-brand-muted-fg">
              From the latest analysis run. {PERCENTILE_CAPTION}
            </p>
          </div>
          {/* One card per reading, side by side so the three positions can be
              compared at a glance; they stack on a phone. */}
          <div className="grid gap-3 md:grid-cols-3">
            {SUB_DIMENSION_ORDER.map((key) => {
              const copy = SUB_DIMENSIONS[key];
              const pctile = subDimValues[key];
              const open = openExplainer === key;
              return (
                <div key={key} className="as-inset flex flex-col gap-2 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-forest-900">
                    {copy.label}
                    <InfoToggle open={open} onToggle={() => toggle(key)} label={copy.label} />
                  </p>
                  <p className="text-xs text-brand-muted-fg">{copy.subtitle}</p>
                  <p className="text-2xl font-bold tabular-nums tracking-[-0.01em] text-forest-900">
                    {pctile !== null ? ordinal(Math.round(pctile)) : "—"}
                    {pctile !== null && (
                      <span className="text-xs font-semibold text-brand-muted-fg"> percentile</span>
                    )}
                  </p>
                  {pctile !== null && <PercentileTrack pctile={pctile} />}
                  {/* D-122: the direction of "good" differs per reading, so each card
                      says which way is which, plus a comparison a beginner can
                      picture. Neither is a verdict. */}
                  {pctile !== null && (
                    <>
                      <p className="text-xs font-semibold text-forest-900">
                        {sentenceCase(percentileReading(key, pctile))}.
                      </p>
                      <p className="text-xs text-brand-muted-fg">{SUB_DIMENSION_DIRECTION[key]}</p>
                    </>
                  )}
                  {open && <ExplainerBody text={copy.detail} />}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        normalisation === "insufficient_universe" && (
          <p className="text-sm text-brand-muted-fg">{INSUFFICIENT_UNIVERSE_NOTE}</p>
        )
      )}

      {hasBands && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-forest-900">Context readings</h3>
            <p className="mt-0.5 text-xs text-brand-muted-fg">
              Shown as ranges and never ranked, because neither extreme is simply better.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {rsiBand && (
              <BandCard
                title="RSI"
                value={formatMetric(recommendation.rsi, 0)}
                reading={Number(recommendation.rsi)}
                bands={RSI_SCALE}
                active={rsiBand}
                meaning={RSI_BAND_MEANING[rsiBand]}
                open={openExplainer === "rsi"}
                onToggle={() => toggle("rsi")}
                detail={CONTEXT_METRICS.rsi.detail}
              />
            )}
            {betaBand && (
              <BandCard
                title="Beta"
                value={formatMetric(recommendation.beta)}
                reading={Number(recommendation.beta)}
                bands={BETA_SCALE}
                active={betaBand}
                meaning={BETA_BAND_MEANING[betaBand]}
                open={openExplainer === "beta"}
                onToggle={() => toggle("beta")}
                detail={CONTEXT_METRICS.beta.detail}
              />
            )}
          </div>
        </section>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          {showRaw ? "Hide raw metrics" : "Show raw metrics"}
          <ChevronDown className={`h-4 w-4 transition-transform ${showRaw ? "rotate-180" : ""}`} />
        </button>
        {showRaw && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {RAW_METRICS.map((m) => (
              <div key={m.key} className="as-inset flex flex-col gap-1 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-brand-muted-fg">{m.label}</span>
                  <span className="text-sm font-bold tabular-nums text-forest-900">
                    {formatMetric(recommendation[m.key], m.digits)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-brand-muted-fg">{m.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The demoted composite-score footer was removed here. It was retained only
          while `raw_quant_score` still ordered the feed — hiding a number that was
          doing real work would have been less honest than disclosing it. The
          disclosed four-factor ranking now decides placement, so the footer showed
          a model judgement that no longer affects anything, competing with the
          percentiles and bands above it that are actual measurements.

          This removal supersedes part of D-076/D-049 (which endorsed keeping the
          score visible), so it ships as its own commit and can be reverted alone.
          `raw_quant_score` is still computed and persisted; retiring the scorer
          itself is the separate cleanup in UNIFIED_SCORING_PLAN.md §4.1. */}
    </div>
  );
}
