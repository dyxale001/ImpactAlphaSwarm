import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Info,
  Layers,
  ListFilter,
  MessageSquareQuote,
  Newspaper,
  Percent,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import PageExplanationDialog from "../guidance/PageExplanationDialog";
import AboutLessons from "../guidance/AboutLessons";
import type { LearningContext } from "../../data/learningContexts";
import { shortLabel } from "../../utils/macroNews";

// "How Market News works": the header's About button and its dialog, in the shared
// About shell the Stocks, Funds and Compare pages use.
//
// Written for someone new to investing (D-234's explainer, D-203's explanation with
// every analytic output): what happens to a story, what the percentages mean and do
// not mean, and how to find your way around. The centre of it is a worked example on
// real stories, because "a story is tagged at 60%" is abstract until you watch one
// story clear the line for two sectors and miss it for a third. The page's caveat
// (relevance, not direction; no effect on the rankings) closes it, as the other
// pages' caveats close theirs.

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
        <li key={step.title} className="as-inset relative flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-800 text-lime-500" aria-hidden>
              <step.icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold text-forest-900">
              <span className="sr-only">Step {i + 1}: </span>
              {step.title}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-brand-muted-fg">{step.body}</p>
          {i < STEPS.length - 1 && (
            <ArrowRight
              className="absolute -right-2.5 top-4 z-10 hidden h-4 w-4 rounded-full bg-white text-brand-muted-fg sm:block"
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
    <div className="flex flex-col gap-4 rounded-[16px] border border-forest-900/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-brand-muted-fg">Real scores, week of 30 Sept</p>
        <div className="as-tabs as-tabs-sm" role="tablist" aria-label="Example stories">
          {EXAMPLES.map((e) => (
            <button
              key={e.key}
              type="button"
              role="tab"
              aria-selected={active === e.key}
              onClick={() => setActive(e.key)}
              className="as-tab"
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-brand-muted-fg">{example.publisher}</p>
        <p className="text-sm font-bold leading-snug text-forest-900">{example.headline}</p>
      </div>

      {/* The chart. Label column, bar column, value column; the 60% line is drawn once
          across the whole bar column so every bar is measured against the same mark. */}
      <figure className="flex flex-col gap-2" aria-label={`Scores for this story. Tagged: ${tagged.join(", ") || "none"}.`}>
        <div className="grid grid-cols-[6.5rem_1fr_2.75rem] items-end gap-x-3 sm:grid-cols-[9rem_1fr_2.75rem]">
          <span />
          <div className="relative h-4">
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-forest-900"
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
                <span className={`truncate text-xs ${isTagged ? "font-bold text-forest-900" : "text-brand-muted-fg"}`}>
                  <span className="sm:hidden">{shortLabel(label)}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
                <span className="relative h-2.5 rounded-full bg-forest-50">
                  {/* Rounded at the data end; a sliver stays visible at 0-1%. */}
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${isTagged ? "bg-forest-700" : "bg-neutral-400"}`}
                    style={{ width: `max(4px, ${pct}%)` }}
                  />
                  <span
                    className="absolute -inset-y-1 w-0 border-l-2 border-dashed border-forest-900/70"
                    style={{ left: `${linePct}%` }}
                    aria-hidden
                  />
                </span>
                <span className={`text-right text-xs tabular-nums ${isTagged ? "font-bold text-forest-900" : "text-brand-muted-fg"}`}>
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
        <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-muted-fg">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-forest-700" aria-hidden />
            Tagged (at or above the line)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-neutral-400" aria-hidden />
            Not tagged
          </span>
        </figcaption>
      </figure>

      <p className="text-sm leading-relaxed text-forest-900">
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h3>
      {children}
    </section>
  );
}

const WAYFINDING = [
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
];

export default function AboutMarketNews({
  threshold = 0.6,
  learnContext,
  className = "",
}: {
  threshold?: number;
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
        About this page
      </button>
      {open && (
        <PageExplanationDialog title="How Market News works" onClose={close} triggerRef={triggerRef} navigatingRef={navigatingRef}>
          <p className="text-base leading-relaxed text-forest-900">
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
              <div className="as-inset p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  It means
                </p>
                <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
                  <li>How sure the model is that a story is about that sector.</li>
                  <li>97% means it's very sure; 24% means a loose link at most.</li>
                  <li>Every score is shown, low ones included, so you can check the model's reading.</li>
                </ul>
              </div>
              <div className="as-inset p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
                  <X className="h-3.5 w-3.5" aria-hidden />
                  It doesn't mean
                </p>
                <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
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
            <div className="as-inset p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900">
                <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </span>
                AI overview
              </p>
              <p className="text-sm leading-relaxed text-forest-900">
                Each sector's box like this one is a short summary, written by AI from the stories tagged to that sector
                and rewritten when they change. It's told to report only what the stories say: never whether news is
                good or bad, never a prediction, never advice. It can still make mistakes, so the stories it was written
                from sit right under it.
              </p>
            </div>
          </Section>

          <Section title="Finding your way around">
            <ul className="grid gap-2 sm:grid-cols-2">
              {WAYFINDING.map((item) => (
                <li key={item.title} className="as-inset flex gap-3 p-3">
                  <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-hidden />
                  <div>
                    <p className="text-sm font-bold text-forest-900">{item.title}</p>
                    <p className="text-xs leading-relaxed text-brand-muted-fg">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          {learnContext && <AboutLessons context={learnContext} title="Lessons for this page" onNavigate={leave} />}
          <p className="border-t border-forest-900/10 pt-4 text-xs leading-relaxed text-brand-muted-fg">
            Relevance, not direction: nothing on this page says whether news is good or bad. Market News informs; it
            doesn't advise, and nothing on it changes AlphaSwarm's rankings or signals.
          </p>
        </PageExplanationDialog>
      )}
    </>
  );
}
