import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { LearningContext } from '../../data/learningContexts';
import { PAGE_EXPLANATIONS, type ExplanationPage, type PageExplanation } from './pageExplanations';
import PageExplanationDialog from './PageExplanationDialog';
import StocksAbout from './StocksAbout';
import FundsAbout from './FundsAbout';
import WhalesAbout from './WhalesAbout';
import AboutLessons from './AboutLessons';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="flex flex-col gap-3">
    <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h3>
    {children}
  </section>;
}

function Cards({ cards }: { cards: { title: string; body: string }[] }) {
  return <div className="grid gap-2 sm:grid-cols-2">{cards.map(card => <div key={card.title} className="as-inset p-4">
    <h4 className="mb-1.5 text-sm font-bold text-forest-900">{card.title}</h4>
    <p className="text-xs leading-relaxed text-brand-muted-fg">{card.body}</p>
  </div>)}</div>;
}

/** The shared layout for pages whose explanation has not been given its own
 * illustrated version yet: purpose, process, interpretation, example, limits. */
function StandardAbout({ page, content }: { page: ExplanationPage; content: PageExplanation }) {
  return <>
    <p className="text-base leading-relaxed text-forest-900">{content.introduction}</p>
    {content.interpretation && page === 'funds' && <Section title={content.interpretation.title}><Cards cards={content.interpretation.cards} /></Section>}
    <Section title={content.process.title}>
      <ol className="grid gap-2 sm:grid-cols-3">{content.process.steps.map((step, index) => <li key={step.title} className="as-inset flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-brand-accent" aria-hidden="true">{index + 1}</span><h4 className="text-sm font-bold text-forest-900"><span className="sr-only">Step {index + 1}: </span>{step.title}</h4></div>
        <p className="text-xs leading-relaxed text-brand-muted-fg">{step.body}</p>
      </li>)}</ol>
    </Section>
    {content.interpretation && page !== 'funds' && <Section title={content.interpretation.title}><Cards cards={content.interpretation.cards} /></Section>}
    <Section title={content.example.title}>
      <div className="rounded-[16px] border border-forest-900/10 p-4">
        <p className="mb-2 text-xs font-semibold text-brand-muted-fg">Illustrative example</p>
        <p className="text-sm leading-relaxed text-forest-900">{content.example.body}</p>
      </div>
    </Section>
    <Section title={content.limitations.title}>
      {content.limitations.paragraphs.map(paragraph => <p key={paragraph} className="text-sm leading-relaxed text-brand-muted-fg">{paragraph}</p>)}
    </Section>
    {content.nextSteps && <Section title={content.nextSteps.title}><p className="text-sm leading-relaxed text-brand-muted-fg">{content.nextSteps.body}</p></Section>}
  </>;
}

export default function AboutThisPage({ page, rankingMode, methodologyHref, learnContext, className = '' }: {
  page: ExplanationPage;
  rankingMode?: 'legacy' | 'scorecard';
  methodologyHref?: string;
  /** Lists this page's lessons inside the dialog ("Learn as you explore"). */
  learnContext?: LearningContext;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigatingRef = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  const content: PageExplanation = PAGE_EXPLANATIONS[page];
  // Leaving for another page (a lesson or the methodology) closes the dialog
  // without restoring the old scroll position onto the new page.
  const leave = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    navigatingRef.current = true;
    close();
  }, [close]);
  return <>
    <button ref={triggerRef} type="button" onClick={() => { navigatingRef.current = false; setOpen(true); }} aria-haspopup="dialog" aria-expanded={open}
      className={`as-btn as-btn-sm as-btn-ghost-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${className}`}>
      <Info className="h-3.5 w-3.5" aria-hidden="true" />About this page
    </button>
    {open && <PageExplanationDialog title={content.title} onClose={close} triggerRef={triggerRef} navigatingRef={navigatingRef}>
      {page === 'stocks'
        ? <StocksAbout content={content} rankingMode={rankingMode} methodologyHref={methodologyHref} learnContext={learnContext} onNavigate={leave} />
        : page === 'funds'
        ? <FundsAbout content={content} learnContext={learnContext} onNavigate={leave} />
        : page === 'whales'
        ? <WhalesAbout content={content} learnContext={learnContext} onNavigate={leave} />
        : <>
          <StandardAbout page={page} content={content} />
          {learnContext && <AboutLessons context={learnContext} title="Lessons for this page" onNavigate={leave} />}
        </>}
      <p className="border-t border-forest-900/10 pt-4 text-xs leading-relaxed text-brand-muted-fg">{content.caveat}</p>
    </PageExplanationDialog>}
  </>;
}
