import { useState } from "react";
import { Info } from "lucide-react";
import {
  CONVERGENCE_DETAIL,
  CONVERGENCE_HEADLINE,
  CONVERGENCE_TONE,
  DIRECTION_COPY,
  QUANT_STATE_NOTE,
  SCORECARD_DISCLOSURE,
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

function TermTrack({ value }: { value: number }) {
  const pos = Math.max(2, Math.min(98, value * 100));
  return (
    <div className="relative h-1.5 w-full bg-background rounded-full mt-1.5">
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-brand-primary border-2 border-brand-surface shadow-sm"
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}

export default function SignalScorecard({
  terms,
  compact = false,
}: {
  terms: SignalTerms;
  compact?: boolean;
}) {
  const [open, setOpen] = useState<TermKey | "headline" | null>(null);

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
            className={`chip ${CONVERGENCE_TONE[state]} font-semibold`}
          >
            {CONVERGENCE_HEADLINE[state]}
            <Info className="w-3 h-3 shrink-0" />
          </button>
          {terms.signalDirection && (
            <p className="text-[11px] text-brand-muted-fg mt-1.5">
              {DIRECTION_COPY[terms.signalDirection] ?? terms.signalDirection}
            </p>
          )}
          {open === "headline" && (
            <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg bg-brand-bg/55 border border-brand-border/50 rounded-xl px-3 py-2">
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
                  <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
                    {copy.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-brand-muted-fg">
                    {value === null ? "not measured" : copy.question}
                    <Info className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100" />
                  </span>
                </div>
                {value !== null && <TermTrack value={value} />}
              </button>
              {isOpen && (
                <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg bg-brand-bg/55 border border-brand-border/50 rounded-xl px-3 py-2">
                  {copy.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {quantNote && (
        <p className="text-[11px] text-slate-400">{quantNote}</p>
      )}

      {!compact && (
        <p className="text-[11px] text-brand-muted-fg leading-relaxed">
          {SCORECARD_DISCLOSURE}
        </p>
      )}
    </div>
  );
}
