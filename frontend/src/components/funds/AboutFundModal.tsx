import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Columns2,
  FileText,
  Newspaper,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  FUND_ABOUT_COST_AMOUNTS,
  FUND_ABOUT_COST_FUNDS,
  FUND_ABOUT_COST_LABEL,
  FUND_ABOUT_COST_READ,
  FUND_ABOUT_COST_TITLE,
  FUND_ABOUT_DONE,
  FUND_ABOUT_EYEBROW,
  FUND_ABOUT_FOOTER,
  FUND_ABOUT_INTRO,
  FUND_ABOUT_LABELS,
  FUND_ABOUT_LABELS_TITLE,
  FUND_ABOUT_MEANS,
  FUND_ABOUT_MEANS_LABEL,
  FUND_ABOUT_MEANS_TITLE,
  FUND_ABOUT_NOT_MEANS,
  FUND_ABOUT_NOT_MEANS_LABEL,
  FUND_ABOUT_PAST_NOTE,
  FUND_ABOUT_RISK_BODY,
  FUND_ABOUT_RISK_MATCH,
  FUND_ABOUT_RISK_STEPS,
  FUND_ABOUT_RISK_TITLE,
  FUND_ABOUT_STEPS,
  FUND_ABOUT_STEPS_TITLE,
  FUND_ABOUT_TITLE,
  FUND_ABOUT_WAYFINDING,
  FUND_ABOUT_WAYFINDING_TITLE,
  formatCostCaption,
  formatRandAmount,
} from "../../utils/fundsCopy";

// "How Funds works", opened from the funds page header's About button.
//
// The Funds counterpart of the Compare and Market News dialogs, built the
// same way: written for someone new to investing (D-203), a short pipeline, one
// worked example, what the page does and does not tell you, then how to find your
// way around. Every sentence lives in fundsCopy.ts, where the forbidden-term scan
// reads it with the rest of the funds copy.
//
// The worked example is the cost, because it is the figure every card leads with
// and the one a beginner cannot read unaided: 1.8% and 0.2% look alike as
// percentages and do not as rand.
//
// Built as the platform's modals are: a dimmed forest backdrop with no blur, Escape
// and the backdrop close it, focus moves in and goes back to the button afterwards.
// Rendered into document.body because the page animates in with a transform, and a
// fixed overlay inside a transformed parent is positioned against that parent
// rather than the screen.

const STEP_ICONS: Record<(typeof FUND_ABOUT_STEPS)[number]["key"], ComponentType<{ className?: string }>> = {
  publish: Newspaper,
  record: ClipboardList,
  match: Sparkles,
  browse: SlidersHorizontal,
};

const WAYFINDING_ICONS: Record<
  (typeof FUND_ABOUT_WAYFINDING)[number]["key"],
  ComponentType<{ className?: string }>
> = {
  matched: Sparkles,
  inputs: UserRound,
  browse: SlidersHorizontal,
  fund: FileText,
  compare: Columns2,
};

// The same tones the fund cards draw these labels in (StalenessChip, the badges),
// set for the dialog's light ground.
const LABEL_TONES: Record<(typeof FUND_ABOUT_LABELS)[number]["key"], string> = {
  current: "rounded-full bg-brand-bg px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-forest-500",
  ageing: "rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-warning-strong",
  stale: "rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-danger",
  tfsa: "chip bg-brand-accent text-brand-fg",
  tracker: "chip border border-dashed border-forest-500/60 bg-transparent text-forest-600",
};

function Pipeline() {
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {FUND_ABOUT_STEPS.map((step, i) => {
        const Icon = STEP_ICONS[step.key];
        return (
          <li key={step.key} className="relative flex flex-col gap-2 rounded-2xl bg-brand-bg p-3">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-brand-accent"
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[13px] font-bold text-brand-primary">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-forest-600">{step.body}</p>
            {i < FUND_ABOUT_STEPS.length - 1 && (
              <ArrowRight
                className="absolute -right-2.5 top-4 z-10 hidden h-4 w-4 rounded-full bg-brand-card text-forest-500 sm:block"
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Three made-up funds that differ only in their charge, priced in rand on an amount
// the reader picks. Bars share one scale, so the largest charge sets the width.
function CostExample() {
  const [amount, setAmount] = useState<number>(FUND_ABOUT_COST_AMOUNTS[0]);
  const rows = FUND_ABOUT_COST_FUNDS.map((fund) => ({
    ...fund,
    rand: (amount * fund.charge) / 100,
  }));
  const largest = Math.max(...rows.map((row) => row.rand));

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-brand-border/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-forest-500">{FUND_ABOUT_COST_LABEL}</p>
        <div className="inline-flex rounded-full bg-brand-bg p-1" role="tablist" aria-label="Amount invested">
          {FUND_ABOUT_COST_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={amount === value}
              onClick={() => setAmount(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums transition-transform duration-[120ms] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
                amount === value ? "bg-brand-primary text-brand-bg" : "text-forest-600 hover:text-brand-primary"
              }`}
            >
              {formatRandAmount(value)}
            </button>
          ))}
        </div>
      </div>

      <figure className="m-0 flex flex-col gap-2.5">
        <figcaption className="text-[13px] font-bold text-brand-primary">
          {formatCostCaption(formatRandAmount(amount) ?? "")}
        </figcaption>
        {/* Keyed on the amount so the bars draw fresh at their new widths. */}
        <ul key={amount} className="animate-fade-up flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.name}
              className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-x-3 sm:grid-cols-[7rem_1fr_4rem]"
            >
              <span className="text-xs text-forest-900">
                {row.name} <span className="tabular-nums text-forest-500">· {row.charge}%</span>
              </span>
              <span className="relative h-2.5 rounded-full bg-brand-bg" aria-hidden>
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] bg-brand-primary"
                  style={{ width: `${largest > 0 ? (row.rand / largest) * 100 : 0}%` }}
                />
              </span>
              <span className="text-right text-xs font-bold tabular-nums text-brand-primary">
                {formatRandAmount(row.rand)}
              </span>
            </li>
          ))}
        </ul>
      </figure>

      <p className="text-xs leading-relaxed text-forest-900">{FUND_ABOUT_COST_READ}</p>
    </div>
  );
}

// The five steps, the way the page's risk scale draws them, with every step named.
function RiskSteps() {
  return (
    <ol className="grid grid-cols-5 gap-1.5">
      {FUND_ABOUT_RISK_STEPS.map((label, i) => (
        <li key={label} className="flex flex-col gap-1.5">
          <span className="h-1.5 rounded-full bg-brand-accent" style={{ opacity: 0.35 + i * 0.16 }} aria-hidden />
          <span className="text-[11px] leading-snug text-forest-600">
            <span className="font-bold tabular-nums text-brand-primary">{i + 1}</span> {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[15px] font-bold tracking-[-0.01em] text-brand-primary">{title}</h3>
      {children}
    </section>
  );
}

export default function AboutFundModal({
  open,
  onClose,
  compareEnabled,
}: {
  open: boolean;
  onClose: () => void;
  /** Without Compare, the dialog leaves out the line about it. */
  compareEnabled: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Escape closes it; focus moves in on open and back to whatever opened it on close;
  // the page behind stops scrolling while it is up.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const wayfinding = FUND_ABOUT_WAYFINDING.filter((item) => compareEnabled || item.key !== "compare");

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 bg-forest-900/50" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-fade-up relative my-auto flex max-h-[min(90dvh,56rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-brand-card shadow-xl focus:outline-none"
      >
        {/* The forest header the platform's panels use. */}
        <header className="hero-card flex shrink-0 items-start justify-between gap-3 rounded-none px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">
              {FUND_ABOUT_EYEBROW}
            </p>
            <h2 id={titleId} className="mt-0.5 text-lg font-bold tracking-[-0.015em] text-brand-bg">
              {FUND_ABOUT_TITLE}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-brand-bg/70 transition-colors hover:bg-white/10 hover:text-brand-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-7 overflow-y-auto px-5 py-6 sm:px-6">
          <p className="text-sm leading-relaxed text-forest-900">{FUND_ABOUT_INTRO}</p>

          <Section title={FUND_ABOUT_STEPS_TITLE}>
            <Pipeline />
          </Section>

          <Section title={FUND_ABOUT_COST_TITLE}>
            <CostExample />
          </Section>

          <Section title={FUND_ABOUT_RISK_TITLE}>
            <RiskSteps />
            <p className="text-xs leading-relaxed text-forest-600">{FUND_ABOUT_RISK_BODY}</p>
            <p className="text-xs leading-relaxed text-forest-500">{FUND_ABOUT_RISK_MATCH}</p>
          </Section>

          <Section title={FUND_ABOUT_LABELS_TITLE}>
            <ul className="flex flex-col gap-2">
              {FUND_ABOUT_LABELS.map((item) => (
                <li
                  key={item.key}
                  className="flex flex-col gap-2 rounded-2xl bg-brand-bg p-3 sm:flex-row sm:items-start sm:gap-3"
                >
                  <span className="sm:w-36 sm:shrink-0">
                    <span className={`inline-flex items-center ${LABEL_TONES[item.key]}`}>{item.label}</span>
                  </span>
                  <p className="text-xs leading-relaxed text-forest-600">{item.body}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={FUND_ABOUT_MEANS_TITLE}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-brand-bg p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {FUND_ABOUT_MEANS_LABEL}
                </p>
                <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-forest-600">
                  {FUND_ABOUT_MEANS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl bg-brand-bg p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                  <X className="h-3.5 w-3.5" aria-hidden />
                  {FUND_ABOUT_NOT_MEANS_LABEL}
                </p>
                <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-forest-600">
                  {FUND_ABOUT_NOT_MEANS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-forest-500">{FUND_ABOUT_PAST_NOTE}</p>
          </Section>

          <Section title={FUND_ABOUT_WAYFINDING_TITLE}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {wayfinding.map((item) => {
                const Icon = WAYFINDING_ICONS[item.key];
                return (
                  <li key={item.key} className="flex gap-3 rounded-2xl bg-brand-bg p-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-hidden />
                    <div>
                      <p className="text-xs font-bold text-brand-primary">{item.title}</p>
                      <p className="text-xs leading-relaxed text-forest-600">{item.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <p className="border-t border-brand-border/60 pt-4 text-xs leading-relaxed text-forest-500">
            {FUND_ABOUT_FOOTER}
          </p>
        </div>

        <footer className="flex shrink-0 justify-end border-t border-brand-border/60 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-brand-primary px-4 py-2 text-xs font-bold text-brand-bg transition-transform duration-[120ms] hover:opacity-85 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            {FUND_ABOUT_DONE}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
