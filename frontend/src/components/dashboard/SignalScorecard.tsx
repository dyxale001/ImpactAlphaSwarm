import { useState } from "react";
import { Info } from "lucide-react";
import {
  CONVERGENCE_DETAIL,
  CONVERGENCE_HEADLINE,
  CONVERGENCE_TONE,
  CONVERGENCE_TONE_ON_DARK,
  DIRECTION_COPY,
  QUANT_STATE_NOTE,
  TERM_COPY,
  type ConvergenceState,
  type TermKey,
} from "../../data/signalCopy";

/**
 * The Signal Scorecard — replaces the 0-100 "Confidence Score" ring.
 *
 * Deliberately shows NO composite number. A single figure is what made the old
 * score read as "how good a buy is this"; the four factors that actually decide
 * the ordering are shown instead, each with a plain-language explainer.
 *
 * Visual language is borrowed from QuantMetricsPanel on purpose: a position
 * MARKER on a neutral track, never a fill bar. A filled bar reads as a score out
 * of 100 — exactly the impression being removed.
 */

export interface SignalTerms {
  signalStrength: number | null;
  signalDirection: string | null;
  convergence: number | null;
  convergenceState: ConvergenceState | null;
  dataSufficiency: number | null;
  profileFit: number | null;
  quantState: string | null;
}

function TermTrack({
  value,
  onDark = false,
}: {
  value: number;
  onDark?: boolean;
}) {
  const pos = Math.max(2, Math.min(98, value * 100));
  return (
    <div
      className={`relative h-1.5 w-full rounded-full mt-1.5 ${
        onDark ? "bg-white/15" : "bg-background"
      }`}
    >
      <div
        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 shadow-sm ${
          onDark
            ? "bg-brand-accent border-brand-primary"
            : "bg-brand-primary border-brand-surface"
        }`}
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}

export default function SignalScorecard({
  terms,
  compact = false,
  onDark = false,
}: {
  terms: SignalTerms;
  compact?: boolean;
  /** Render on a dark (forest) surface: lime labels, light text, tinted tracks. */
  onDark?: boolean;
}) {
  const [open, setOpen] = useState<TermKey | "headline" | null>(null);

  const labelTone = onDark ? "text-brand-accent" : "text-primary";
  const mutedTone = onDark ? "text-brand-bg/60" : "text-brand-muted-fg";
  const explainerTone = onDark
    ? "text-brand-bg/75 bg-white/10 border-white/10"
    : "text-brand-muted-fg bg-brand-bg/55 border-brand-border/50";

  const state = terms.convergenceState;
  const rows: { key: TermKey; value: number | null }[] = [
    { key: "signal_strength", value: terms.signalStrength },
    { key: "convergence", value: terms.convergence },
    { key: "data_sufficiency", value: terms.dataSufficiency },
    { key: "profile_fit", value: terms.profileFit },
  ];

  const quantNote = terms.quantState ? QUANT_STATE_NOTE[terms.quantState] : undefined;

  return (
    <div className="space-y-3">
      {/* Headline: a STATE, not a grade. */}
      {state && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(open === "headline" ? null : "headline")}
            aria-expanded={open === "headline"}
            className={`chip ${
              (onDark ? CONVERGENCE_TONE_ON_DARK : CONVERGENCE_TONE)[state]
            } font-semibold`}
          >
            {CONVERGENCE_HEADLINE[state]}
            <Info className="w-3 h-3 shrink-0" />
          </button>
          {terms.signalDirection && (
            <p className={`text-[11px] mt-1.5 ${mutedTone}`}>
              {DIRECTION_COPY[terms.signalDirection] ?? terms.signalDirection}
            </p>
          )}
          {open === "headline" && (
            <p
              className={`mt-2 text-xs leading-relaxed border rounded-xl px-3 py-2 ${explainerTone}`}
            >
              {CONVERGENCE_DETAIL[state]}
            </p>
          )}
        </div>
      )}

      {/* Why it sits where it does — one row per disclosed factor. */}
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {rows.map(({ key, value }) => {
          const copy = TERM_COPY[key];
          const isOpen = open === key;
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : key)}
                aria-expanded={isOpen}
                className="w-full text-left group"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-[10px] uppercase tracking-widest font-semibold ${labelTone}`}
                  >
                    {copy.label}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] ${mutedTone}`}
                  >
                    {value === null ? "not measured" : copy.question}
                    <Info className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100" />
                  </span>
                </div>
                {value !== null && <TermTrack value={value} onDark={onDark} />}
              </button>
              {isOpen && (
                <p
                  className={`mt-2 text-xs leading-relaxed border rounded-xl px-3 py-2 ${explainerTone}`}
                >
                  {copy.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {quantNote && (
        <p className={`text-[11px] ${onDark ? "text-brand-bg/60" : "text-slate-400"}`}>
          {quantNote}
        </p>
      )}

      {/* The "these four measurements decide the order / weighting is editorial /
          not financial advice" paragraph used to sit here. It repeated under every
          scorecard, which buried the factors it was meant to qualify. The same
          explanation now lives once per page: in full in the ranking walkthrough
          (each card links straight to it) and in the page-level disclaimer. */}
    </div>
  );
}
