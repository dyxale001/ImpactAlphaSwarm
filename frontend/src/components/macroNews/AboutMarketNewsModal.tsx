import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Layers,
  ListFilter,
  MessageSquareQuote,
  Newspaper,
  Percent,
  Tag,
  X,
} from "lucide-react";
import { shortLabel } from "../../utils/macroNews";

// "How Market News works", opened from the header's About button.
//
// Written for someone new to investing (D-234's explainer, D-203's explanation with
// every analytic output): what happens to a story, what the percentages mean and do
// not mean, and how to find your way around. The centre of it is a worked example on
// real stories, because "a story is tagged at 60%" is abstract until you watch one
// story clear the line for two sectors and miss it for a third.
//
// Built as the platform's modals are: a dimmed forest backdrop with no blur (Verdant
// has no backdrop-filter), Escape and the backdrop close it, focus moves in and goes
// back to the button afterwards. Rendered into document.body because the page
// animates in with a transform, and a fixed overlay inside a transformed parent is
// positioned against that parent rather than the screen.

/** Scores Jev gave three real stories in the week of 30 September 2026. */
const EXAMPLES: { key: string; label: string; publisher: string; headline: string; scores: Record<string, number> }[] = [
  {
    key: "spacex",
    label: "Two sectors",
    publisher: "CNBC",
    headline: "SpaceX set to launch Google AI chips into orbit in push toward space-based data centers",
    scores: {
      Technology: 0.97,
      "AI & Robotics": 0.97,
      "Media & Communications": 0.24,
      "Market-wide": 0.03,
      "Green Energy": 0.02,
      Finance: 0.02,
      Healthcare: 0.01,
    },
  },
  {
    key: "gilts",
    label: "Market-wide",
    publisher: "Reuters",
    headline: "UK 30-year gilt yields top 6% for the first time since 1998",
    scores: {
      "Market-wide": 0.97,
      Finance: 0.97,
      Technology: 0.01,
      "Green Energy": 0.01,
      "AI & Robotics": 0.01,
      Healthcare: 0.01,
      "Media & Communications": 0.01,
    },
  },
  {
    key: "evs",
    label: "One sector",
    publisher: "Reuters",
    headline: "UK new car sales rise 12% in September as EVs and Chinese brands gain ground",
    scores: {
      "Green Energy": 0.91,
      "Market-wide": 0.08,
      Technology: 0.06,
      Finance: 0.03,
      "Media & Communications": 0.02,
      "AI & Robotics": 0.01,
      Healthcare: 0.0,
    },
  },
];

const STEPS = [
  {
    icon: Newspaper,
    title: "Collect",
    body: "Three times a day, new stories arrive from Reuters, CNBC and Bloomberg.",
  },
  {
    icon: BrainCircuit,
    title: "Read",
    body: "An AI model reads each headline and summary and answers yes or no: is this about Technology? About Finance? And so on, one question per sector.",
  },
  {
    icon: Percent,
    title: "Score",
    body: "Each answer comes with a percentage: how sure the model is that the answer is yes.",
  },
  {
    icon: Tag,
    title: "Tag",
    body: "A score of 60% or more tags the story to that sector. A story can have several tags, or none.",
  },
];

function Pipeline() {
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {STEPS.map((step, i) => (
        <li key={step.title} className="relative flex flex-col gap-2 rounded-2xl bg-brand-bg p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-brand-accent" aria-hidden>
              <step.icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-[13px] font-bold text-brand-primary">
              <span className="sr-only">Step {i + 1}: </span>
              {step.title}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-brand-secondary">{step.body}</p>
          {i < STEPS.length - 1 && (
            <ArrowRight
              className="absolute -right-2.5 top-4 z-10 hidden h-4 w-4 rounded-full bg-brand-card text-brand-muted-fg sm:block"
              aria-hidden
            />
          )}
        </li>
      ))}
    </ol>
  );
}

// One story's seven scores as bars against the 60% line. Bars are coloured by state,
// not by sector: forest when the score clears the line (tagged), grey when it does not,
// because the line deciding the tag is the one idea this chart is here to show. Every
// bar carries its name and value in text, so nothing rests on colour alone.
function ScoreExample({ threshold }: { threshold: number }) {
  const [active, setActive] = useState(EXAMPLES[0].key);
  const example = EXAMPLES.find((e) => e.key === active) ?? EXAMPLES[0];
  const rows = Object.entries(example.scores).sort((a, b) => b[1] - a[1]);
  const tagged = rows.filter(([, p]) => p >= threshold).map(([label]) => label);
  const nearest = rows.find(([, p]) => p < threshold);
  const linePct = Math.round(threshold * 100);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-brand-border/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">Real scores, week of 30 Sept</p>
        <div className="inline-flex rounded-full bg-brand-bg p-1" role="tablist" aria-label="Example stories">
          {EXAMPLES.map((e) => (
            <button
              key={e.key}
              type="button"
              role="tab"
              aria-selected={active === e.key}
              onClick={() => setActive(e.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-transform duration-[120ms] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
                active === e.key ? "bg-brand-primary text-brand-bg" : "text-brand-secondary hover:text-brand-primary"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-brand-muted-fg">{example.publisher}</p>
        <p className="text-sm font-bold leading-snug text-brand-primary">{example.headline}</p>
      </div>

      {/* The chart. Label column, bar column, value column; the 60% line is drawn once
          across the whole bar column so every bar is measured against the same mark. */}
      <figure className="flex flex-col gap-2" aria-label={`Scores for this story. Tagged: ${tagged.join(", ") || "none"}.`}>
        <div className="grid grid-cols-[6.5rem_1fr_2.75rem] items-end gap-x-3 sm:grid-cols-[9rem_1fr_2.75rem]">
          <span />
          <div className="relative h-4">
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-brand-primary"
              style={{ left: `${linePct}%` }}
            >
              {linePct}% line
            </span>
          </div>
          <span />
        </div>
        {/* Keyed on the example so each story draws fresh at its own widths. */}
        <ul key={example.key} className="animate-fade-up relative flex flex-col gap-1.5">
          {rows.map(([label, p]) => {
            const isTagged = p >= threshold;
            const pct = Math.round(p * 100);
            return (
              <li
                key={label}
                className="group grid grid-cols-[6.5rem_1fr_2.75rem] items-center gap-x-3 sm:grid-cols-[9rem_1fr_2.75rem]"
                title={`${label}: ${pct}%${isTagged ? ", tagged" : ", below the line"}`}
              >
                <span className={`truncate text-xs ${isTagged ? "font-bold text-brand-primary" : "text-brand-secondary"}`}>
                  <span className="sm:hidden">{shortLabel(label)}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
                <span className="relative h-2.5 rounded-full bg-brand-bg">
                  {/* Rounded at the data end only; a sliver stays visible at 0-1%. */}
                  <span
                    className={`absolute inset-y-0 left-0 rounded-r-[4px] ${
                      isTagged ? "bg-brand-primary" : "bg-neutral-500"
                    }`}
                    style={{ width: `max(2px, ${pct}%)` }}
                  />
                  <span
                    className="absolute -inset-y-1 w-0 border-l-2 border-dashed border-brand-primary/70"
                    style={{ left: `${linePct}%` }}
                    aria-hidden
                  />
                </span>
                <span className={`text-right text-xs tabular-nums ${isTagged ? "font-bold text-brand-primary" : "text-brand-muted-fg"}`}>
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
        <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-brand-muted-fg">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-brand-primary" aria-hidden />
            Tagged (at or above the line)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-neutral-500" aria-hidden />
            Not tagged
          </span>
        </figcaption>
      </figure>

      <p className="text-xs leading-relaxed text-brand-fg/90">
        <span className="font-semibold">What happened: </span>
        {tagged.length === 0
          ? "nothing reached the line, so the story isn't tagged and sits under Untagged."
          : `${tagged.join(" and ")} cleared the line, so the story shows under ${
              tagged.length === 1 ? "that sector" : "each of those sectors"
            }.`}
        {nearest && nearest[1] >= 0.1
          ? ` ${nearest[0]} scored ${Math.round(nearest[1] * 100)}%: some connection, but not enough for a tag.`
          : " Everything else scored close to zero."}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[15px] font-bold tracking-[-0.01em] text-brand-primary">{title}</h3>
      {children}
    </section>
  );
}

export default function AboutMarketNewsModal({
  open,
  onClose,
  threshold = 0.6,
}: {
  open: boolean;
  onClose: () => void;
  threshold?: number;
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent">About this page</p>
            <h2 id={titleId} className="mt-0.5 text-lg font-bold tracking-[-0.015em] text-brand-bg">
              How Market News works
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
          <p className="text-sm leading-relaxed text-brand-fg/90">
            World news can affect whole groups of companies at once: an interest-rate decision touches banks, a chip
            export ban touches technology firms. This page gathers the week's news and shows which of AlphaSwarm's
            sectors each story is about, so you can see what's happening around the stocks you follow.
          </p>

          <Section title="What happens to each story">
            <Pipeline />
          </Section>

          <Section title="See it on a real story">
            <ScoreExample threshold={threshold} />
          </Section>

          <Section title="What the percentage means">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-brand-bg p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  It means
                </p>
                <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-secondary">
                  <li>How sure the model is that a story is about that sector.</li>
                  <li>97% means it's very sure; 24% means a loose link at most.</li>
                  <li>Every score is shown, low ones included, so you can check the model's reading.</li>
                </ul>
              </div>
              <div className="rounded-2xl bg-brand-bg p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                  <X className="h-3.5 w-3.5" aria-hidden />
                  It doesn't mean
                </p>
                <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-secondary">
                  <li>Whether the news is good or bad for the sector.</li>
                  <li>The chance that prices will move.</li>
                  <li>A reason to buy or sell anything.</li>
                </ul>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-brand-muted-fg">
              The model only sees the headline and the publisher's short summary, so it can be wrong. Every story links
              to the full article.
            </p>
          </Section>

          <Section title="The AI overviews">
            <div className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                <BrainCircuit className="h-3 w-3 text-brand-primary" />
                AI overview
              </div>
              <p className="text-sm leading-relaxed text-brand-fg/90">
                Each sector's box like this one is a short summary, written by AI from the stories tagged to that sector
                and rewritten when they change. It's told to report only what the stories say: never whether news is
                good or bad, never a prediction, never advice. It can still make mistakes, so the stories it was written
                from sit right under it.
              </p>
            </div>
          </Section>

          <Section title="Finding your way around">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  icon: Layers,
                  title: "Sectors",
                  body: "The quick read: an overview and the top stories for each of your sectors, plus news that affects every sector.",
                },
                {
                  icon: ListFilter,
                  title: "All stories",
                  body: "Every tagged story with all its scores, filterable by sector. Untagged shows the rest, so nothing is hidden.",
                },
                {
                  icon: MessageSquareQuote,
                  title: "Commentary label",
                  body: "Marks a presenter's or columnist's view on a stock rather than a news event. These never lead a summary.",
                },
                {
                  icon: Newspaper,
                  title: "On each stock's page",
                  body: "A Market news tab shows the news for that stock's sector. It's about the sector, not the company itself.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3 rounded-2xl bg-brand-bg p-3">
                  <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-hidden />
                  <div>
                    <p className="text-xs font-bold text-brand-primary">{item.title}</p>
                    <p className="text-xs leading-relaxed text-brand-secondary">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <p className="border-t border-brand-border/60 pt-4 text-xs leading-relaxed text-brand-muted-fg">
            Market News informs; it doesn't advise. Nothing on this page changes AlphaSwarm's rankings or signals.
          </p>
        </div>

        <footer className="flex shrink-0 justify-end border-t border-brand-border/60 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-brand-primary px-4 py-2 text-xs font-bold text-brand-bg transition-transform duration-[120ms] hover:opacity-85 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            Got it
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
