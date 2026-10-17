import { useState, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Clock,
  Eye,
  Flame,
  LayoutList,
  ListOrdered,
  MessageCircleQuestion,
  MessageSquareText,
  Newspaper,
  RefreshCw,
  Scale,
  Sparkles,
  Table2,
  Trophy,
  X,
} from 'lucide-react';
import {
  CONVERGENCE_HEADLINE,
  TERM_COPY,
  type ConvergenceState,
} from '../../data/signalCopy';
import type { LearningContext } from '../../data/learningContexts';
import type { PageExplanation } from './pageExplanations';
import AboutLessons from './AboutLessons';
import {
  STOCKS_AGREEMENT_MEANING,
  STOCKS_EXAMPLE,
  STOCKS_EXAMPLE_LEAD,
  STOCKS_LABELS_TITLE,
  STOCKS_LEGACY_TITLE,
  STOCKS_LESSONS_TITLE,
  STOCKS_MEANS,
  STOCKS_MEANS_LABEL,
  STOCKS_MEANS_TITLE,
  STOCKS_METHODOLOGY_LINK,
  STOCKS_NOT_MEANS,
  STOCKS_NOT_MEANS_LABEL,
  STOCKS_OTHER_LABELS,
  STOCKS_SCORECARD_TITLE,
  STOCKS_TIMES,
  STOCKS_WAYFINDING,
  STOCKS_WAYFINDING_TITLE,
  type StocksExampleKey,
} from './stocksAboutCopy';

// "How Stocks works", built the way the Funds, Compare and Market News dialogs
// are: a short illustrated pipeline, one worked example the reader can play with,
// the labels the page uses, what it does and does not tell you, and a map of the
// page. "Learn as you explore" lives here too, as the lessons for this page.

const STEP_ICONS: ComponentType<{ className?: string }>[] = [Newspaper, Scale, ListOrdered, MessageSquareText];

const TIME_ICONS: Record<(typeof STOCKS_TIMES)[number]['key'], ComponentType<{ className?: string }>> = {
  run: RefreshCw,
  sentiment: CalendarClock,
  market: Clock,
};

const WAYFINDING_ICONS: Record<(typeof STOCKS_WAYFINDING)[number]['key'], ComponentType<{ className?: string }>> = {
  top: Trophy,
  shortlist: LayoutList,
  also: Table2,
  analysis: BookOpen,
  watchlist: Eye,
  ask: MessageCircleQuestion,
};

const STATE_TONE: Record<ConvergenceState, string> = {
  agree_strongly: 'chip chip-up',
  lean_together: 'chip',
  mixed: 'chip',
  conflict: 'chip chip-caution',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h3>
      {children}
    </section>
  );
}

function Pipeline({ steps }: { steps: PageExplanation['process']['steps'] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {steps.map((step, i) => {
        const Icon = STEP_ICONS[i] ?? ListOrdered;
        return (
          <li key={step.title} className="as-inset relative flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-brand-accent" aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
              <h4 className="text-sm font-bold text-forest-900">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h4>
            </div>
            <p className="text-xs leading-relaxed text-brand-muted-fg">{step.body}</p>
            {i < steps.length - 1 && (
              <ArrowRight
                className="absolute -right-2.5 top-5 z-10 hidden h-4 w-4 rounded-full bg-white text-forest-500 sm:block"
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Track({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-forest-900">{label}</span>
      <span className="relative h-1.5 rounded-full bg-forest-100" aria-hidden="true">
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest-700 shadow-sm transition-[left] duration-300"
          style={{ left: `${value}%` }}
        />
      </span>
    </div>
  );
}

// Two made-up stocks with the same news tone and different price evidence. The
// reader switches between them; the scorecard and the agreement label move.
function WorkedExample({ body, showFactors }: { body: string; showFactors: boolean }) {
  const [key, setKey] = useState<StocksExampleKey>('agree');
  const stock = STOCKS_EXAMPLE[key];
  return (
    <div className="flex flex-col gap-4 rounded-[16px] border border-forest-900/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-muted-fg">{STOCKS_EXAMPLE_LEAD}</p>
        <div className="as-tabs as-tabs-sm" role="tablist" aria-label="Example stock">
          {(Object.keys(STOCKS_EXAMPLE) as StocksExampleKey[]).map(k => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={key === k}
              onClick={() => setKey(k)}
              className="as-tab"
            >
              {STOCKS_EXAMPLE[k].tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="as-inset flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-forest-900">Sentiment score</span>
              <span className="font-bold tabular-nums text-forest-900">{stock.sentiment} / 100</span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-forest-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-forest-700 transition-[width] duration-300" style={{ width: `${stock.sentiment}%` }} />
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-forest-900">Price trend vs peers</span>
              <span className="font-bold tabular-nums text-forest-900">{stock.pricePercentile}th percentile</span>
            </span>
            <span className="relative h-1.5 rounded-full bg-forest-100" aria-hidden="true">
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest-700 shadow-sm transition-[left] duration-300"
                style={{ left: `${stock.pricePercentile}%` }}
              />
            </span>
          </div>
        </div>

        <div className="as-inset flex flex-col gap-3 p-4">
          <span className={`${STATE_TONE[stock.state]} self-start`}>{CONVERGENCE_HEADLINE[stock.state]}</span>
          {showFactors && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Track label={TERM_COPY.signal_strength.label} value={stock.terms.signalStrength} />
              <Track label={TERM_COPY.convergence.label} value={stock.terms.agreement} />
              <Track label={TERM_COPY.data_sufficiency.label} value={stock.terms.evidenceDepth} />
              <Track label={TERM_COPY.profile_fit.label} value={stock.terms.fit} />
            </div>
          )}
        </div>
      </div>

      <p aria-live="polite" className="text-sm leading-relaxed text-forest-900">{stock.outcome}</p>
      <p className="text-xs leading-relaxed text-brand-muted-fg">{body}</p>
    </div>
  );
}

export default function StocksAbout({ content, rankingMode, methodologyHref, learnContext, onNavigate }: {
  content: PageExplanation;
  rankingMode?: 'legacy' | 'scorecard';
  methodologyHref?: string;
  learnContext?: LearningContext;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <>
      <p className="text-base leading-relaxed text-forest-900">{content.introduction}</p>

      <Section title={content.process.title}>
        <Pipeline steps={content.process.steps} />
      </Section>

      <Section title={content.example.title}>
        <WorkedExample body={content.example.body} showFactors={rankingMode !== 'legacy'} />
      </Section>

      {rankingMode === 'scorecard' && (
        <Section title={STOCKS_SCORECARD_TITLE}>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.values(TERM_COPY).map(term => (
              <div key={term.label} className="as-inset flex flex-col gap-1.5 p-4">
                <h4 className="text-sm font-bold text-forest-900">{term.label}</h4>
                <p className="text-xs font-semibold text-forest-700">{term.question}</p>
                <p className="text-xs leading-relaxed text-brand-muted-fg">{term.detail}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
      {rankingMode === 'legacy' && (
        <Section title={STOCKS_LEGACY_TITLE}>
          <p className="text-sm leading-relaxed text-brand-muted-fg">
            The confidence view combines price measurements and news/social sentiment with the run’s adjustments. It is an analysis score, not the probability that the price will rise or that you will make a profit.
          </p>
        </Section>
      )}

      <Section title={STOCKS_LABELS_TITLE}>
        <ul className="flex flex-col gap-2">
          {(Object.keys(STOCKS_AGREEMENT_MEANING) as ConvergenceState[]).map(state => (
            <li key={state} className="as-inset flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="sm:w-52 sm:shrink-0"><span className={STATE_TONE[state]}>{CONVERGENCE_HEADLINE[state]}</span></span>
              <p className="text-xs leading-relaxed text-brand-muted-fg">{STOCKS_AGREEMENT_MEANING[state]}</p>
            </li>
          ))}
          {STOCKS_OTHER_LABELS.map(item => (
            <li key={item.key} className="as-inset flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="sm:w-52 sm:shrink-0">
                <span className={item.key === 'hype' ? 'chip chip-caution' : 'chip chip-accent'}>
                  {item.key === 'hype' ? <Flame className="h-3 w-3" aria-hidden="true" /> : item.key === 'discovered' ? <Sparkles className="h-3 w-3" aria-hidden="true" /> : <Check className="h-3 w-3" aria-hidden="true" />}
                  {item.label}
                </span>
              </span>
              <p className="text-xs leading-relaxed text-brand-muted-fg">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={content.limitations.title}>
        <ol className="grid gap-2 sm:grid-cols-3" aria-label="The three times shown on this page">
          {STOCKS_TIMES.map(time => {
            const Icon = TIME_ICONS[time.key];
            return (
              <li key={time.key} className="as-inset flex flex-col gap-2 p-3">
                <span className="flex items-center gap-2 text-sm font-bold text-forest-900">
                  <Icon className="h-4 w-4 text-forest-700" aria-hidden="true" />
                  {time.label}
                </span>
                <p className="text-xs leading-relaxed text-brand-muted-fg">{time.body}</p>
              </li>
            );
          })}
        </ol>
        {content.limitations.paragraphs.map(paragraph => (
          <p key={paragraph} className="text-sm leading-relaxed text-brand-muted-fg">{paragraph}</p>
        ))}
      </Section>

      <Section title={STOCKS_MEANS_TITLE}>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="as-inset p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
              <Check className="h-4 w-4 text-up" aria-hidden="true" />{STOCKS_MEANS_LABEL}
            </p>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
              {STOCKS_MEANS.map(line => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div className="as-inset p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
              <X className="h-4 w-4 text-down" aria-hidden="true" />{STOCKS_NOT_MEANS_LABEL}
            </p>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
              {STOCKS_NOT_MEANS.map(line => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </div>
      </Section>

      <Section title={STOCKS_WAYFINDING_TITLE}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {STOCKS_WAYFINDING.map(item => {
            const Icon = WAYFINDING_ICONS[item.key];
            return (
              <li key={item.key} className="as-inset flex gap-3 p-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-forest-900">{item.title}</p>
                  <p className="text-xs leading-relaxed text-brand-muted-fg">{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {learnContext && <AboutLessons context={learnContext} title={STOCKS_LESSONS_TITLE} onNavigate={onNavigate} />}

      {methodologyHref && (
        <div>
          <Link
            to={methodologyHref}
            onClick={onNavigate}
            className="as-btn as-btn-secondary as-btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {STOCKS_METHODOLOGY_LINK} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </>
  );
}
