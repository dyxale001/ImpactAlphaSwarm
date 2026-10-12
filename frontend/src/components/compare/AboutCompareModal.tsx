import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BrainCircuit,
  Building2,
  Check,
  ChartLine,
  Columns2,
  Link2,
  MessagesSquare,
  MousePointerClick,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { RowTag } from "./CompareGrid";
import {
  ABOUT_DONE,
  ABOUT_EXAMPLE_CHANGE_READ,
  ABOUT_EXAMPLE_LABEL,
  ABOUT_EXAMPLE_PRICE_READ,
  ABOUT_EXAMPLE_STOCKS,
  ABOUT_EXAMPLE_TITLE,
  ABOUT_EXAMPLE_VIEWS,
  ABOUT_EYEBROW,
  ABOUT_FOOTER,
  ABOUT_INTRO,
  ABOUT_MARKS,
  ABOUT_MARKS_TITLE,
  ABOUT_MEANS,
  ABOUT_MEANS_LABEL,
  ABOUT_MEANS_TITLE,
  ABOUT_NOT_MEANS,
  ABOUT_NOT_MEANS_LABEL,
  ABOUT_PAST_NOTE,
  ABOUT_STEPS,
  ABOUT_STEPS_TITLE,
  ABOUT_TITLE,
  ABOUT_TRACE_BADGE,
  ABOUT_TRACE_BODY,
  ABOUT_TRACE_TITLE,
  ABOUT_WAYFINDING,
  ABOUT_WAYFINDING_TITLE,
} from "../../data/compareCopy";

// "How Compare works", opened from the header's About button.
//
// The Compare counterpart of Market News's About dialog, built the same way: written
// for someone new to investing (D-203), a short pipeline, one worked example, what
// the page does and does not tell you, then how to find your way around. Every
// sentence lives in compareCopy.ts with the rest of the page's copy.
//
// The worked example is the one idea a newcomer most often gets wrong on a
// comparison: a higher share price looks like "more", so the page compares change
// instead. Toggling between the two views on the same two stocks shows why.
//
// Built as the platform's modals are: a dimmed forest backdrop with no blur, Escape
// and the backdrop close it, focus moves in and goes back to the button afterwards.
// Rendered into document.body because the page animates in with a transform, and a
// fixed overlay inside a transformed parent is positioned against that parent
// rather than the screen.

const PRESSABLE =
  "transition-transform duration-[120ms] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent";

const STEP_ICONS: Record<(typeof ABOUT_STEPS)[number]["key"], ComponentType<{ className?: string }>> = {
  pick: MousePointerClick,
  line: Columns2,
  mark: Tag,
  explain: BrainCircuit,
};

const WAYFINDING_ICONS: Record<(typeof ABOUT_WAYFINDING)[number]["key"], ComponentType<{ className?: string }>> = {
  overview: ChartLine,
  tone: MessagesSquare,
  yours: UserRound,
  funds: Building2,
  share: Link2,
};

function Pipeline() {
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {ABOUT_STEPS.map((step, i) => {
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
            <p className="text-xs leading-relaxed text-brand-secondary">{step.body}</p>
            {i < ABOUT_STEPS.length - 1 && (
              <ArrowRight
                className="absolute -right-2.5 top-4 z-10 hidden h-4 w-4 rounded-full bg-brand-card text-brand-muted-fg sm:block"
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

type View = keyof typeof ABOUT_EXAMPLE_VIEWS;

// Two made-up stocks drawn two ways. In the price view each bar is the share price
// against the dearer one, so the cheap share is a sliver; in the change view each
// bar is the percentage move, so the cheap share's larger move shows. Same colour for
// both stocks, because the point is the length, and every bar carries its value in
// text.
function ChangeExample() {
  const [view, setView] = useState<View>("price");
  const rows = ABOUT_EXAMPLE_STOCKS.map((s) => ({
    name: s.name,
    price: s.end,
    change: Math.round(((s.end - s.start) / s.start) * 100),
  }));
  const max = Math.max(...rows.map((r) => (view === "price" ? r.price : r.change)));

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-brand-border/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">{ABOUT_EXAMPLE_LABEL}</p>
        <div className="inline-flex rounded-full bg-brand-bg p-1" role="tablist" aria-label="Example view">
          {(Object.keys(ABOUT_EXAMPLE_VIEWS) as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`${PRESSABLE} rounded-full px-3 py-1 text-xs font-semibold ${
                view === v ? "bg-brand-primary text-brand-bg" : "text-brand-secondary hover:text-brand-primary"
              }`}
            >
              {ABOUT_EXAMPLE_VIEWS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Keyed on the view so the bars draw fresh at their new lengths. */}
      <ul key={view} className="animate-fade-up flex flex-col gap-2.5" aria-label={ABOUT_EXAMPLE_VIEWS[view]}>
        {rows.map((r) => {
          const value = view === "price" ? r.price : r.change;
          const text = view === "price" ? `R${r.price}` : `+${r.change}%`;
          return (
            <li key={r.name} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-x-3">
              <span className="text-xs font-bold text-brand-primary">{r.name}</span>
              <span className="relative h-2.5 rounded-full bg-brand-bg">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] bg-brand-primary"
                  style={{ width: `max(2px, ${(value / max) * 100}%)` }}
                />
              </span>
              <span className="text-right text-xs font-bold tabular-nums text-brand-primary">{text}</span>
            </li>
          );
        })}
      </ul>

      <p className="text-xs leading-relaxed text-brand-fg/90">
        {view === "price" ? ABOUT_EXAMPLE_PRICE_READ : ABOUT_EXAMPLE_CHANGE_READ}
      </p>
    </div>
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

export default function AboutCompareModal({
  open,
  onClose,
  fundsEnabled,
}: {
  open: boolean;
  onClose: () => void;
  /** Without the funds half, the dialog leaves out what it says about funds. */
  fundsEnabled: boolean;
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

  const wayfinding = ABOUT_WAYFINDING.filter((item) => fundsEnabled || item.key !== "funds");

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
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">{ABOUT_EYEBROW}</p>
            <h2 id={titleId} className="mt-0.5 text-lg font-bold tracking-[-0.015em] text-brand-bg">
              {ABOUT_TITLE}
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
          <p className="text-sm leading-relaxed text-brand-fg/90">{ABOUT_INTRO}</p>

          <Section title={ABOUT_STEPS_TITLE}>
            <Pipeline />
          </Section>

          <Section title={ABOUT_EXAMPLE_TITLE}>
            <ChangeExample />
          </Section>

          <Section title={ABOUT_MARKS_TITLE}>
            <ul className="flex flex-col gap-2">
              {ABOUT_MARKS.map((mark) => (
                <li key={mark.label} className="flex flex-col gap-2 rounded-2xl bg-brand-bg p-3 sm:flex-row sm:items-start sm:gap-3">
                  <span className="sm:w-28 sm:shrink-0">
                    <RowTag kind={mark.kind}>{mark.label}</RowTag>
                  </span>
                  <p className="text-xs leading-relaxed text-brand-secondary">{mark.body}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={ABOUT_MEANS_TITLE}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-brand-bg p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {ABOUT_MEANS_LABEL}
                </p>
                <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-secondary">
                  {ABOUT_MEANS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl bg-brand-bg p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                  <X className="h-3.5 w-3.5" aria-hidden />
                  {ABOUT_NOT_MEANS_LABEL}
                </p>
                <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-secondary">
                  {ABOUT_NOT_MEANS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-brand-muted-fg">{ABOUT_PAST_NOTE}</p>
          </Section>

          <Section title={ABOUT_TRACE_TITLE}>
            <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                <BrainCircuit className="h-3 w-3 text-brand-primary" />
                {ABOUT_TRACE_BADGE}
              </div>
              <p className="text-sm leading-relaxed text-brand-fg/90">{ABOUT_TRACE_BODY}</p>
            </div>
          </Section>

          <Section title={ABOUT_WAYFINDING_TITLE}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {wayfinding.map((item) => {
                const Icon = WAYFINDING_ICONS[item.key];
                return (
                  <li key={item.key} className="flex gap-3 rounded-2xl bg-brand-bg p-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-hidden />
                    <div>
                      <p className="text-xs font-bold text-brand-primary">{item.title}</p>
                      <p className="text-xs leading-relaxed text-brand-secondary">{item.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <p className="border-t border-brand-border/60 pt-4 text-xs leading-relaxed text-brand-muted-fg">
            {ABOUT_FOOTER}
          </p>
        </div>

        <footer className="flex shrink-0 justify-end border-t border-brand-border/60 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className={`${PRESSABLE} rounded-full bg-brand-primary px-4 py-2 text-xs font-bold text-brand-bg hover:opacity-85`}
          >
            {ABOUT_DONE}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
