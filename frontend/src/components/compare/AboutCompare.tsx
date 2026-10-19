import { useCallback, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import PageExplanationDialog from "../guidance/PageExplanationDialog";
import AboutLessons from "../guidance/AboutLessons";
import type { LearningContext } from "../../data/learningContexts";
import {
  ArrowRight,
  Info,
  Sparkles,
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

const STEP_ICONS: Record<(typeof ABOUT_STEPS)[number]["key"], ComponentType<{ className?: string }>> = {
  pick: MousePointerClick,
  line: Columns2,
  mark: Tag,
  explain: Sparkles,
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
          <li key={step.key} className="as-inset relative flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-brand-accent"
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-bold text-forest-900">
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
    <div className="flex flex-col gap-4 rounded-[16px] border border-forest-900/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-brand-muted-fg">{ABOUT_EXAMPLE_LABEL}</p>
        <div className="as-tabs as-tabs-sm" role="tablist" aria-label="Example view">
          {(Object.keys(ABOUT_EXAMPLE_VIEWS) as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className="as-tab"
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
              <span className="relative h-2.5 rounded-full bg-forest-100">
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
      <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h3>
      {children}
    </section>
  );
}

/**
 * "How Compare works": the page's About button and its dialog, in the shared
 * "About this page" shell the Stocks and Funds pages use, with this page's
 * lessons inside it ("Learn as you explore") rather than in a card on the page.
 */
export default function AboutCompare({
  fundsEnabled,
  learnContext,
  className = "",
}: {
  /** Without the funds half, the dialog leaves out what it says about funds. */
  fundsEnabled: boolean;
  learnContext?: LearningContext;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigatingRef = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  const leave = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      navigatingRef.current = true;
      close();
    },
    [close],
  );
  const wayfinding = ABOUT_WAYFINDING.filter((item) => fundsEnabled || item.key !== "funds");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          navigatingRef.current = false;
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`as-btn as-btn-sm as-btn-ghost-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${className}`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
        {ABOUT_EYEBROW}
      </button>
      {open && (
        <PageExplanationDialog title={ABOUT_TITLE} onClose={close} triggerRef={triggerRef} navigatingRef={navigatingRef}>
      <p className="text-base leading-relaxed text-forest-900">{ABOUT_INTRO}</p>

      <Section title={ABOUT_STEPS_TITLE}>
        <Pipeline />
      </Section>

      <Section title={ABOUT_EXAMPLE_TITLE}>
        <ChangeExample />
      </Section>

      <Section title={ABOUT_MARKS_TITLE}>
        <ul className="flex flex-col gap-2">
          {ABOUT_MARKS.map((mark) => (
            <li key={mark.label} className="flex flex-col gap-2 as-inset p-3 sm:flex-row sm:items-start sm:gap-3">
              <span className="sm:w-28 sm:shrink-0">
                <RowTag kind={mark.kind}>{mark.label}</RowTag>
              </span>
              <p className="text-xs leading-relaxed text-brand-muted-fg">{mark.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={ABOUT_MEANS_TITLE}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="as-inset p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {ABOUT_MEANS_LABEL}
            </p>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
              {ABOUT_MEANS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="as-inset p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
              <X className="h-3.5 w-3.5" aria-hidden />
              {ABOUT_NOT_MEANS_LABEL}
            </p>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
              {ABOUT_NOT_MEANS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-brand-muted-fg">{ABOUT_PAST_NOTE}</p>
      </Section>

      <Section title={ABOUT_TRACE_TITLE}>
        <div className="as-inset p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900">
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            {ABOUT_TRACE_BADGE}
          </p>
          <p className="text-sm leading-relaxed text-forest-900">{ABOUT_TRACE_BODY}</p>
        </div>
      </Section>

      <Section title={ABOUT_WAYFINDING_TITLE}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {wayfinding.map((item) => {
            const Icon = WAYFINDING_ICONS[item.key];
            return (
              <li key={item.key} className="flex gap-3 as-inset p-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-hidden />
                <div>
                  <p className="text-sm font-bold text-forest-900">{item.title}</p>
                  <p className="text-xs leading-relaxed text-brand-muted-fg">{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

          {learnContext && <AboutLessons context={learnContext} title="Lessons for this page" onNavigate={leave} />}
          <p className="border-t border-forest-900/10 pt-4 text-xs leading-relaxed text-brand-muted-fg">
            {ABOUT_FOOTER} The columns are in the order you picked them.
          </p>
        </PageExplanationDialog>
      )}
    </>
  );
}
