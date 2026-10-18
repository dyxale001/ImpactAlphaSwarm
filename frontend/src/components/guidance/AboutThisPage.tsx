import { useCallback, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { TERM_COPY } from "../../data/signalCopy";
import {
  PAGE_EXPLANATIONS,
  type ExplanationPage,
  type PageExplanation,
} from "./pageExplanations";
import PageExplanationDialog from "./PageExplanationDialog";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[15px] font-bold tracking-[-0.01em] text-brand-primary">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function AboutThisPage({
  page,
  rankingMode,
  methodologyHref,
  className = "",
}: {
  page: ExplanationPage;
  rankingMode?: "legacy" | "scorecard";
  methodologyHref?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigatingRef = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  const content: PageExplanation = PAGE_EXPLANATIONS[page];
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
        className={`relative mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1.5 text-[11px] font-bold text-brand-fg hover:bg-lime-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${className}`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        About this page
      </button>
      {open && (
        <PageExplanationDialog
          title={content.title}
          onClose={close}
          triggerRef={triggerRef}
          navigatingRef={navigatingRef}
        >
          <p className="text-sm leading-relaxed text-brand-fg/90">
            {content.introduction}
          </p>
          {content.interpretation && page === "funds" && (
            <Section title={content.interpretation.title}>
              <div className="grid gap-3 sm:grid-cols-2">
                {content.interpretation.cards.map((card) => (
                  <div key={card.title} className="rounded-2xl bg-brand-bg p-4">
                    <h4 className="mb-2 text-xs font-bold text-brand-primary">
                      {card.title}
                    </h4>
                    <p className="text-xs leading-relaxed text-brand-secondary">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <Section title={content.process.title}>
            <ol className="grid gap-2 sm:grid-cols-3">
              {content.process.steps.map((step, index) => (
                <li
                  key={step.title}
                  className="flex flex-col gap-2 rounded-2xl bg-brand-bg p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-brand-accent"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <h4 className="text-[13px] font-bold text-brand-primary">
                      <span className="sr-only">Step {index + 1}: </span>
                      {step.title}
                    </h4>
                  </div>
                  <p className="text-xs leading-relaxed text-brand-secondary">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </Section>
          {page === "stocks" && rankingMode && (
            <Section title="Understand the score">
              {rankingMode === "scorecard" ? (
                <>
                  <p className="text-xs leading-relaxed text-brand-secondary">
                    Where available, the scorecard separates four readings.
                    Strength and direction are different: a strong reading does
                    not automatically mean an upward signal.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.values(TERM_COPY).map((term) => (
                      <div
                        key={term.label}
                        className="rounded-2xl bg-brand-bg p-4"
                      >
                        <h4 className="mb-2 text-xs font-bold text-brand-primary">
                          {term.label}
                        </h4>
                        <p className="text-xs leading-relaxed text-brand-secondary">
                          {term.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-brand-secondary">
                  The confidence view combines price measurements and
                  news/social sentiment with the run’s adjustments. It is an
                  analysis score, not the probability that the price will rise
                  or that you will make a profit.
                </p>
              )}
            </Section>
          )}
          {content.interpretation && page !== "funds" && (
            <Section title={content.interpretation.title}>
              <div className="grid gap-3 sm:grid-cols-2">
                {content.interpretation.cards.map((card) => (
                  <div key={card.title} className="rounded-2xl bg-brand-bg p-4">
                    <h4 className="mb-2 text-xs font-bold text-brand-primary">
                      {card.title}
                    </h4>
                    <p className="text-xs leading-relaxed text-brand-secondary">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <Section title={content.example.title}>
            <div className="rounded-2xl border border-brand-border/60 p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                Illustrative example
              </p>
              <p className="text-xs leading-relaxed text-brand-secondary">
                {content.example.body}
              </p>
            </div>
          </Section>
          <Section title={content.limitations.title}>
            {content.limitations.paragraphs.map((paragraph) => (
              <p
                key={paragraph}
                className="text-xs leading-relaxed text-brand-secondary"
              >
                {paragraph}
              </p>
            ))}
          </Section>
          {content.nextSteps && (
            <Section title={content.nextSteps.title}>
              <p className="text-xs leading-relaxed text-brand-secondary">
                {content.nextSteps.body}
              </p>
            </Section>
          )}
          {page === "stocks" && methodologyHref && (
            <Link
              to={methodologyHref}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                navigatingRef.current = true;
                close();
              }}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              How it works: methodology
            </Link>
          )}
          <p className="border-t border-brand-border/60 pt-4 text-xs leading-relaxed text-brand-muted-fg">
            {content.caveat}
          </p>
        </PageExplanationDialog>
      )}
    </>
  );
}
