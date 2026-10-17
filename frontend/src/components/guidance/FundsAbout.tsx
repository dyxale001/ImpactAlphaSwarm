import { useState, type ComponentType, type MouseEvent, type ReactNode } from 'react';
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
} from 'lucide-react';
import type { LearningContext } from '../../data/learningContexts';
import type { PageExplanation } from './pageExplanations';
import AboutLessons from './AboutLessons';
import { COMPARE_ENABLED } from '../../utils/compareFlags';
import {
  FUND_ABOUT_COST_AMOUNTS,
  FUND_ABOUT_COST_FUNDS,
  FUND_ABOUT_COST_LABEL,
  FUND_ABOUT_COST_READ,
  FUND_ABOUT_COST_TITLE,
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
  FUND_ABOUT_WAYFINDING,
  FUND_ABOUT_WAYFINDING_TITLE,
  formatCostCaption,
  formatRandAmount,
} from '../../utils/fundsCopy';

// "How Funds works", inside the shared "About this page" dialog. Written for someone
// new to investing (D-203): a short pipeline, one worked example (the cost, because
// 1.8% and 0.2% look alike as percentages and do not as rand), how risk is read, the
// labels, what the page does and does not tell you, the limits of the match, a map of
// the page, and the lessons for it. The fund sentences live in fundsCopy.ts, where the
// forbidden-term scan reads them; the match limits are the page explanation's own.

const STEP_ICONS: Record<(typeof FUND_ABOUT_STEPS)[number]['key'], ComponentType<{ className?: string }>> = {
  publish: Newspaper,
  record: ClipboardList,
  match: Sparkles,
  browse: SlidersHorizontal,
};

const WAYFINDING_ICONS: Record<(typeof FUND_ABOUT_WAYFINDING)[number]['key'], ComponentType<{ className?: string }>> = {
  matched: Sparkles,
  inputs: UserRound,
  browse: SlidersHorizontal,
  fund: FileText,
  compare: Columns2,
};

// The tones the fund cards draw these labels in.
const LABEL_TONES: Record<(typeof FUND_ABOUT_LABELS)[number]['key'], string> = {
  current: 'chip bg-white',
  ageing: 'chip chip-caution',
  stale: 'chip chip-down',
  tfsa: 'chip chip-accent',
  tracker: 'chip border border-dashed border-forest-500/60 bg-transparent text-forest-600',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h3>
      {children}
    </section>
  );
}

function Pipeline() {
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {FUND_ABOUT_STEPS.map((step, i) => {
        const Icon = STEP_ICONS[step.key];
        return (
          <li key={step.key} className="as-inset relative flex flex-col gap-2 p-3">
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
            {i < FUND_ABOUT_STEPS.length - 1 && (
              <ArrowRight className="absolute -right-2.5 top-5 z-10 hidden h-4 w-4 rounded-full bg-white text-forest-500 sm:block" aria-hidden="true" />
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
  const rows = FUND_ABOUT_COST_FUNDS.map((fund) => ({ ...fund, rand: (amount * fund.charge) / 100 }));
  const largest = Math.max(...rows.map((row) => row.rand));

  return (
    <div className="flex flex-col gap-4 rounded-[16px] border border-forest-900/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-brand-muted-fg">{FUND_ABOUT_COST_LABEL}</p>
        <div className="as-tabs as-tabs-sm" role="tablist" aria-label="Amount invested">
          {FUND_ABOUT_COST_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={amount === value}
              onClick={() => setAmount(value)}
              className="as-tab tabular-nums"
            >
              {formatRandAmount(value)}
            </button>
          ))}
        </div>
      </div>

      <figure className="m-0 flex flex-col gap-2.5">
        <figcaption className="text-sm font-bold text-forest-900">
          {formatCostCaption(formatRandAmount(amount) ?? '')}
        </figcaption>
        {/* Keyed on the amount so the bars draw fresh at their new widths. */}
        <ul key={amount} className="animate-fade-up flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.name} className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-x-3 sm:grid-cols-[7rem_1fr_4rem]">
              <span className="text-xs text-forest-900">
                {row.name} <span className="tabular-nums text-brand-muted-fg">· {row.charge}%</span>
              </span>
              <span className="relative h-2.5 rounded-full bg-forest-100" aria-hidden="true">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-forest-700"
                  style={{ width: `${largest > 0 ? (row.rand / largest) * 100 : 0}%` }}
                />
              </span>
              <span className="text-right text-xs font-bold tabular-nums text-forest-900">{formatRandAmount(row.rand)}</span>
            </li>
          ))}
        </ul>
      </figure>

      <p className="text-xs leading-relaxed text-forest-900">{FUND_ABOUT_COST_READ}</p>
    </div>
  );
}

// The five steps, the way the cards' risk scale draws them, with every step named.
function RiskSteps() {
  return (
    <ol className="grid grid-cols-5 gap-1.5">
      {FUND_ABOUT_RISK_STEPS.map((label, i) => (
        <li key={label} className="flex flex-col gap-1.5">
          <span className="h-1.5 rounded-full bg-lime-500" style={{ opacity: 0.35 + i * 0.16 }} aria-hidden="true" />
          <span className="text-[11px] leading-snug text-brand-muted-fg">
            <span className="font-bold tabular-nums text-forest-900">{i + 1}</span> {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function FundsAbout({ content, learnContext, onNavigate }: {
  /** The page explanation, for the limits of the match it spells out. */
  content: PageExplanation;
  learnContext?: LearningContext;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const wayfinding = FUND_ABOUT_WAYFINDING.filter((item) => COMPARE_ENABLED || item.key !== 'compare');
  // The match step that names TFSA eligibility and affordability.
  const ruleStep = content.process.steps.find((step) => step.body.includes('TFSA'));

  return (
    <>
      <p className="text-base leading-relaxed text-forest-900">{FUND_ABOUT_INTRO}</p>

      <Section title={FUND_ABOUT_STEPS_TITLE}>
        <Pipeline />
      </Section>

      <Section title={FUND_ABOUT_COST_TITLE}>
        <CostExample />
      </Section>

      <Section title={FUND_ABOUT_RISK_TITLE}>
        <RiskSteps />
        <p className="text-sm leading-relaxed text-brand-muted-fg">{FUND_ABOUT_RISK_BODY}</p>
        <p className="text-sm leading-relaxed text-brand-muted-fg">{FUND_ABOUT_RISK_MATCH}</p>
      </Section>

      <Section title={FUND_ABOUT_LABELS_TITLE}>
        <ul className="flex flex-col gap-2">
          {FUND_ABOUT_LABELS.map((item) => (
            <li key={item.key} className="as-inset flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3">
              <span className="sm:w-36 sm:shrink-0">
                <span className={LABEL_TONES[item.key]}>{item.label}</span>
              </span>
              <p className="text-xs leading-relaxed text-brand-muted-fg">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={FUND_ABOUT_MEANS_TITLE}>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="as-inset p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
              <Check className="h-4 w-4 text-up" aria-hidden="true" />
              {FUND_ABOUT_MEANS_LABEL}
            </p>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
              {FUND_ABOUT_MEANS.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div className="as-inset p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-forest-900">
              <X className="h-4 w-4 text-down" aria-hidden="true" />
              {FUND_ABOUT_NOT_MEANS_LABEL}
            </p>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-brand-muted-fg">
              {FUND_ABOUT_NOT_MEANS.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-brand-muted-fg">{FUND_ABOUT_PAST_NOTE}</p>
      </Section>

      {/* The match's edges: what happens with a missing profile, an unpublished risk
          label or a stated term, and what a match never confirms. */}
      <Section title="Where the match stops">
        <div className="as-inset p-4">
          <p className="mb-1.5 text-sm font-bold text-forest-900">{content.example.title}</p>
          <p className="text-xs leading-relaxed text-brand-muted-fg">{content.example.body}</p>
        </div>
        {content.limitations.paragraphs.slice(0, 2).map((paragraph) => (
          <p key={paragraph} className="text-sm leading-relaxed text-brand-muted-fg">{paragraph}</p>
        ))}
        {ruleStep && <p className="text-sm leading-relaxed text-brand-muted-fg">{ruleStep.body}</p>}
      </Section>

      <Section title={FUND_ABOUT_WAYFINDING_TITLE}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {wayfinding.map((item) => {
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

      {learnContext && <AboutLessons context={learnContext} title="Lessons for this page" onNavigate={onNavigate} />}

      <p className="text-xs leading-relaxed text-brand-muted-fg">{FUND_ABOUT_FOOTER}</p>
    </>
  );
}
