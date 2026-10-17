import { useState, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarCheck,
  Check,
  Download,
  FileText,
  Landmark,
  LayoutGrid,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { LearningContext } from '../../data/learningContexts';
import type { PageExplanation } from './pageExplanations';
import AboutLessons from './AboutLessons';

// "How Whale Watching works": the page's own About, built like the Stocks, Funds,
// Compare and Market News dialogs. A plain introduction, the four things the page
// brings together, a worked example to click through, the three dates every record
// carries, what the records do and do not mean, the AI summaries, and how to find
// your way around, then the sources and the caveat.
//
// The words come from pageExplanations.ts, which the tests read; this file lays
// them out. The worked example draws its rows as the Insider Trading tab draws its
// own, so what the reader learns here is what they will see on a company.

const STEP_ICONS: ComponentType<{ className?: string }>[] = [Search, Users, Landmark, Building2];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h3>
      {children}
    </section>
  );
}

// Spelled out so Tailwind sees each class; one column per step.
const STEP_COLS: Record<number, string> = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };

function Pipeline({ steps }: { steps: PageExplanation['process']['steps'] }) {
  return (
    <ol className={`grid gap-2 ${STEP_COLS[steps.length] ?? 'sm:grid-cols-4'}`}>
      {steps.map((step, i) => {
        const Icon = STEP_ICONS[i] ?? FileText;
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
              <ArrowRight className="absolute -right-2.5 top-5 z-10 hidden h-4 w-4 rounded-full bg-white text-forest-500 sm:block" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Three dealings by one made-up director, each of which leaves them holding more or
// fewer shares, drawn as the Insider Trading tab draws a row. Only the first is a
// decision to buy; the point of the example is the other two.
const DEALINGS = [
  {
    key: 'buy',
    label: 'Open-market buy',
    chip: { text: 'Bought', tone: 'up' as const },
    nature: 'Open market',
    detail: '4,200 shares · traded 29 Sept · filed 1 Oct',
    value: '$720K',
    sub: '@ $171.35',
    means: 'The director chose to buy at the going price, with their own money. Of the three, this is the only decision to buy.',
    doesnt: 'It does not say the price will rise, or that you should buy too.',
  },
  {
    key: 'grant',
    label: 'Share grant',
    chip: { text: 'Grant', tone: 'neutral' as const },
    nature: null,
    detail: '12,000 shares · traded 15 Sept · filed 17 Sept',
    value: '—',
    sub: 'No purchase price',
    means: 'Shares awarded as part of the director’s pay. Their holding grew, but nobody bought anything on the market.',
    doesnt: 'It is not a vote of confidence: grants happen on a schedule.',
  },
  {
    key: 'tax',
    label: 'Withheld for tax',
    chip: { text: 'Tax withholding', tone: 'neutral' as const },
    nature: null,
    detail: '3,100 shares · traded 15 Sept · filed 17 Sept',
    value: '$530K',
    sub: '@ $170.90',
    means: 'The company kept back some of the granted shares to cover the tax owed on them. Routine administration.',
    doesnt: 'It is not a decision to sell, even though the holding went down.',
  },
];

function DealingExample({ closing }: { closing: string }) {
  const [active, setActive] = useState(DEALINGS[0].key);
  const d = DEALINGS.find((x) => x.key === active) ?? DEALINGS[0];
  return (
    <div className="flex flex-col gap-4 rounded-[16px] border border-forest-900/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-brand-muted-fg">One director, three dealings</p>
        <div className="as-tabs as-tabs-sm" role="tablist" aria-label="Example dealings">
          {DEALINGS.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={active === x.key} onClick={() => setActive(x.key)} className="as-tab">
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {/* The row as it appears on a company's Insider Trading tab. */}
      <div key={d.key} className="animate-fade-up flex items-start gap-3 rounded-[12px] border border-forest-900/10 px-4 py-3">
        {d.chip.tone === 'neutral' ? (
          <span className="chip shrink-0">{d.chip.text}</span>
        ) : (
          <span className={`chip shrink-0 ${d.chip.tone === 'up' ? 'chip-up' : 'chip-down'}`}>
            {d.chip.tone === 'up' ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
            {d.chip.text}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-forest-900">
            Example Director <span className="font-normal text-brand-muted-fg">· Director</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-y-1 text-xs text-brand-muted-fg">
            {d.nature && <span className="chip chip-line mr-1.5">{d.nature}</span>}
            {d.detail}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-forest-900">{d.value}</p>
          <p className="text-xs tabular-nums text-brand-muted-fg">{d.sub}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <p className="as-inset flex gap-2 p-3 text-xs leading-relaxed text-brand-muted-fg">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-up" aria-hidden="true" />
          <span><span className="font-semibold text-forest-900">What happened: </span>{d.means}</span>
        </p>
        <p className="as-inset flex gap-2 p-3 text-xs leading-relaxed text-brand-muted-fg">
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-down" aria-hidden="true" />
          <span><span className="font-semibold text-forest-900">What it doesn’t mean: </span>{d.doesnt}</span>
        </p>
      </div>
      <p className="text-sm leading-relaxed text-forest-900">{closing}</p>
    </div>
  );
}

const DATE_ICONS: ComponentType<{ className?: string }>[] = [CalendarCheck, FileText, Download];
const DATE_EXAMPLES = ['5 Oct', '7 Oct', '9 Oct'];

// The three dates as a short timeline: the same three cards the copy describes, in
// the order they happen, each with an example date.
function DateTimeline({ cards }: { cards: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-3" aria-label="The three dates on a record">
      {cards.map((card, i) => {
        const Icon = DATE_ICONS[i] ?? CalendarCheck;
        return (
          <li key={card.title} className="as-inset relative flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-forest-900">
                <Icon className="h-4 w-4 text-forest-500" aria-hidden="true" />
                {card.title}
              </span>
              <span className="chip">{DATE_EXAMPLES[i]}</span>
            </div>
            <p className="text-xs leading-relaxed text-brand-muted-fg">{card.body}</p>
            {i < cards.length - 1 && (
              <ArrowRight className="absolute -right-2.5 top-4 z-10 hidden h-4 w-4 rounded-full bg-white text-forest-500 sm:block" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const MEANS = [
  'Who reported owning the stock, or trading it, and when.',
  'Whether an insider’s dealing was a choice to buy or sell, or routine pay administration.',
  'How the largest holders changed their stakes since their last filing.',
];
const NOT_MEANS = [
  'A reason to copy a trade or a holding.',
  'What anyone holds today: every figure is a reported snapshot.',
  'Where the price will go next.',
];

const WAYFINDING = [
  { icon: LayoutGrid, title: 'Universes', body: 'The companies we cover, grouped by sector. New marks a company the discovery agent added this week.' },
  { icon: Search, title: 'Search', body: 'Jump straight to a company by name or ticker, from either tab.' },
  { icon: Users, title: 'A company’s two tabs', body: 'Insider Trading lists the directors’ dealings; Big Investors lists the largest holders and how their stakes changed.' },
  { icon: Building2, title: 'Top Funds', body: 'The largest holders across our companies. Open one to see every company where it is a top 10 holder.' },
  { icon: FileText, title: 'On each stock’s page', body: 'The same two tabs sit on every stock’s page, so a company reads the same way in both places.' },
];

export default function WhalesAbout({ content, learnContext, onNavigate }: {
  content: PageExplanation;
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
        <DealingExample closing={content.example.body} />
      </Section>

      {content.interpretation && (
        <Section title={content.interpretation.title}>
          <DateTimeline cards={content.interpretation.cards} />
        </Section>
      )}

      <Section title="What the records mean">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="as-inset p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
              <Check className="h-4 w-4 text-up" aria-hidden="true" />
              They tell you
            </p>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
              {MEANS.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div className="as-inset p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
              <X className="h-4 w-4 text-down" aria-hidden="true" />
              They don’t tell you
            </p>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
              {NOT_MEANS.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="The AI summaries">
        <div className="as-inset p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900">
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            Written from the filings
          </p>
          <p className="text-sm leading-relaxed text-forest-900">
            Each tab opens with a short summary, written by AI from that company’s latest filings and saved once per
            company. It is told to describe what insiders and investors did, never to predict prices or advise, and
            the filings it was written from sit right under it, so you can check it.
          </p>
        </div>
      </Section>

      <Section title="Finding your way around">
        <ul className="grid gap-2 sm:grid-cols-2">
          {WAYFINDING.map((item) => (
            <li key={item.title} className="as-inset flex gap-3 p-3">
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-forest-900">{item.title}</p>
                <p className="text-xs leading-relaxed text-brand-muted-fg">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={content.limitations.title}>
        {content.limitations.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-relaxed text-brand-muted-fg">{paragraph}</p>
        ))}
      </Section>

      {learnContext && <AboutLessons context={learnContext} title="Lessons for this page" onNavigate={onNavigate} />}
    </>
  );
}
