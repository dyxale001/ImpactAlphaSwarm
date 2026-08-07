import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import {
  SUB_DIMENSIONS,
  SUB_DIMENSION_ORDER,
  CONTEXT_METRICS,
  RSI_BANDS,
  BETA_BANDS,
  RAW_METRICS,
  PERCENTILE_CAPTION,
  // MODEL_SCORE_LABEL / MODEL_SCORE_DISCLOSURE are no longer imported: the
  // composite-score footer they labelled was removed. The constants remain in
  // quantExplainers.ts so reverting this commit restores the footer intact.
  INSUFFICIENT_UNIVERSE_NOTE,
  NO_DATA_NOTE,
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

function ordinal(n: number) {
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
function PercentileTrack({ pctile }: { pctile: number }) {
  const pos = Math.max(2, Math.min(98, pctile));
  return (
    <div className="relative h-1.5 w-full bg-background rounded-full mt-2">
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-brand-primary border-2 border-brand-surface shadow-sm"
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}

function ExplainerBody({ text }: { text: string }) {
  return (
    <p className="mt-2 text-sm leading-relaxed text-brand-fg/75 bg-brand-bg/55 border border-brand-border/50 rounded-xl px-3 py-2">
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
    <div className="space-y-5">
      {normalisation === "no_data" && (
        <p className="text-sm text-brand-muted-fg italic">{NO_DATA_NOTE}</p>
      )}

      {hasPercentiles ? (
        <div className="space-y-4">
          {SUB_DIMENSION_ORDER.map((key) => {
            const copy = SUB_DIMENSIONS[key];
            const pctile = subDimValues[key];
            const open = openExplainer === key;
            return (
              <div key={key}>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold flex items-center gap-2">
                    {copy.label}
                    <InfoToggle
                      open={open}
                      onToggle={() => toggle(key)}
                      label={copy.label}
                    />
                  </span>
                  <span className="text-foreground font-mono font-semibold text-sm whitespace-nowrap">
                    {pctile !== null
                      ? `${ordinal(Math.round(pctile))} percentile`
                      : "—"}
                  </span>
                </div>
                <p className="text-sm text-brand-fg/75 mt-0.5">
                  {copy.subtitle}
                </p>
                {pctile !== null && <PercentileTrack pctile={pctile} />}
                {open && <ExplainerBody text={copy.detail} />}
              </div>
            );
          })}
          <p className="text-xs text-brand-fg/70">
            {PERCENTILE_CAPTION}
          </p>
        </div>
      ) : (
        normalisation === "insufficient_universe" && (
          <p className="text-sm text-brand-muted-fg">
            {INSUFFICIENT_UNIVERSE_NOTE}
          </p>
        )
      )}

      {hasBands && (
        <div className="space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold">
            Context readings
          </span>
          <div className="flex flex-wrap gap-2">
            {rsiBand && (
              <button
                type="button"
                onClick={() => toggle("rsi")}
                aria-expanded={openExplainer === "rsi"}
                className="inline-flex items-center gap-2 rounded-full border border-brand-border/60 bg-brand-bg/55 px-3 py-1.5 text-sm transition-colors hover:border-brand-primary/40"
              >
                <span className="font-mono font-semibold text-brand-fg">
                  RSI {formatMetric(recommendation.rsi, 0)}
                </span>
                {/* Neutral slate on purpose: colouring "oversold" green would
                    re-encode the buy signal the bands replace. */}
                <span className="text-slate-600 font-medium">
                  {RSI_BANDS[rsiBand]}
                </span>
                <Info className="w-3 h-3 text-brand-muted-fg shrink-0" />
              </button>
            )}
            {betaBand && (
              <button
                type="button"
                onClick={() => toggle("beta")}
                aria-expanded={openExplainer === "beta"}
                className="inline-flex items-center gap-2 rounded-full border border-brand-border/60 bg-brand-bg/55 px-3 py-1.5 text-sm transition-colors hover:border-brand-primary/40"
              >
                <span className="font-mono font-semibold text-brand-fg">
                  Beta {formatMetric(recommendation.beta)}
                </span>
                <span className="text-slate-600 font-medium">
                  {BETA_BANDS[betaBand]}
                </span>
                <Info className="w-3 h-3 text-brand-muted-fg shrink-0" />
              </button>
            )}
          </div>
          {openExplainer === "rsi" && (
            <ExplainerBody text={CONTEXT_METRICS.rsi.detail} />
          )}
          {openExplainer === "beta" && (
            <ExplainerBody text={CONTEXT_METRICS.beta.detail} />
          )}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
          className="text-xs text-brand-primary font-medium hover:underline flex items-center gap-1"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${showRaw ? "rotate-180" : ""}`}
          />
          {showRaw ? "Hide raw metrics" : "Show raw metrics"}
        </button>
        {showRaw && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
            {RAW_METRICS.map((m) => (
              <div
                key={m.key}
                tabIndex={0}
                className="relative group rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3"
              >
                <div className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-1">
                  {m.label}
                </div>
                <div className="text-sm font-semibold text-brand-fg">
                  {formatMetric(recommendation[m.key], m.digits)}
                </div>
                {/* Same hover tooltip treatment as ConfidenceRing, but above the
                    pill — a side flyout would overflow the grid's outer columns. */}
                <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 max-w-[calc(100vw-2rem)] z-50">
                  <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
                    {m.detail}
                  </div>
                </div>
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
