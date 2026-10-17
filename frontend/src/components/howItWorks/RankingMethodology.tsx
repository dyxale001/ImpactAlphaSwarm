import { Gauge, Layers, Scale, UserCheck, X } from 'lucide-react';
import { CONVERGENCE_DETAIL, CONVERGENCE_HEADLINE, TERM_COPY, type ConvergenceState } from '../../data/signalCopy';
import {
  AGREEMENT_FLOOR,
  DEPTH_FLOOR,
  DEPTH_FULL_ARTICLES,
  DEPTH_FULL_POSTS,
  DEPTH_FULL_PRICE_DAYS,
  FIT_BETA_THRESHOLD,
  FIT_FLOOR,
  SHORTLIST_SIZE,
  STRENGTH_PRICE_WEIGHT_PCT,
  TIE_BAND,
} from '../../data/rankingMethodology';
import { Body, Bullets, Cards, Lead, MoreDetail, Note, Section, Strong } from './MethodologyParts';

// How the shortlist is ORDERED. The app publishes no single 0-100 grade, so "how
// is this calculated?" is a question about the four factors that decide placement.
// Factor wording comes from data/signalCopy.ts, the same source the scorecard uses.

const FACTORS = [
  { key: 'signal_strength' as const, icon: Gauge },
  { key: 'convergence' as const, icon: Scale },
  { key: 'data_sufficiency' as const, icon: Layers },
  { key: 'profile_fit' as const, icon: UserCheck },
];

const STATE_TONE: Record<ConvergenceState, string> = {
  agree_strongly: 'chip chip-up',
  lean_together: 'chip',
  mixed: 'chip',
  conflict: 'chip chip-caution',
};

/** The four factors as one multiplication, so the shape of the rule is visible first. */
function Equation() {
  return (
    <div className="as-inset flex flex-wrap items-center justify-center gap-2 p-4" role="img"
      aria-label={`${FACTORS.map(f => TERM_COPY[f.key].label).join(' times ')} gives the order of your top ${SHORTLIST_SIZE}`}>
      {FACTORS.map((f, i) => (
        <span key={f.key} className="flex items-center gap-2" aria-hidden="true">
          <span className="chip chip-line bg-white">
            <f.icon className="h-3.5 w-3.5 text-forest-700" />
            {TERM_COPY[f.key].label}
          </span>
          {i < FACTORS.length - 1 && <X className="h-3.5 w-3.5 text-forest-500" />}
        </span>
      ))}
      <span className="flex items-center gap-2 text-sm font-bold text-forest-900" aria-hidden="true">
        = your top {SHORTLIST_SIZE}
      </span>
    </div>
  );
}

// An illustrative stock that is strong on three factors and weak on one.
const DEMO = [
  { label: 'Signal strength', value: 0.9 },
  { label: 'Agreement', value: 0.9 },
  { label: 'Evidence depth', value: 0.9 },
  { label: 'Fit with your profile', value: FIT_FLOOR },
];
const DEMO_AVERAGE = DEMO.reduce((sum, d) => sum + d.value, 0) / DEMO.length;
const DEMO_PRODUCT = DEMO.reduce((product, d) => product * d.value, 1);

function Meter({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs">
        <span className={strong ? 'font-bold text-forest-900' : 'text-brand-muted-fg'}>{label}</span>
        <span className="font-semibold tabular-nums text-forest-900">{value.toFixed(2)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-forest-100">
        <div className={`h-full rounded-full ${strong ? 'bg-forest-700' : 'bg-forest-500'}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function MultiplyDemo() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="as-inset space-y-2.5 p-4">
        <p className="text-xs font-semibold text-brand-muted-fg">An illustrative stock</p>
        {DEMO.map(d => <Meter key={d.label} label={d.label} value={d.value} />)}
      </div>
      <div className="as-inset flex flex-col justify-center gap-4 p-4">
        <div className="space-y-1">
          <Meter label="If the four were averaged" value={DEMO_AVERAGE} />
          <p className="text-xs text-brand-muted-fg">The weak fit is hidden by the three strong readings.</p>
        </div>
        <div className="space-y-1">
          <Meter label="Multiplied, as we do" value={DEMO_PRODUCT} strong />
          <p className="text-xs text-brand-muted-fg">The weak fit pulls the whole stock down the list.</p>
        </div>
      </div>
    </div>
  );
}

const FACTOR_RANGE: Record<(typeof FACTORS)[number]['key'], string> = {
  signal_strength: `Price and tone count ${STRENGTH_PRICE_WEIGHT_PCT}/${100 - STRENGTH_PRICE_WEIGHT_PCT}. The price side is the stock's position among its peers; the tone side is the sentiment score itself.`,
  convergence: `Full marks when price and tone point the same way. Never below ${AGREEMENT_FLOOR}, so disagreement lowers a stock without removing it.`,
  data_sufficiency: `Full marks at ${DEPTH_FULL_ARTICLES} trusted articles, ${DEPTH_FULL_POSTS} posts and ${DEPTH_FULL_PRICE_DAYS} days of prices, averaged. Never below ${DEPTH_FLOOR}.`,
  profile_fit: `A Conservative profile and a beta above ${FIT_BETA_THRESHOLD} lowers this, never below ${FIT_FLOOR}. Moderate and Aggressive profiles always get full marks.`,
};

export default function RankingMethodology() {
  return (
    <>
      <Lead>
        Four measurements decide where a stock sits in your top {SHORTLIST_SIZE}. They are
        shown to you on every stock, and there is deliberately no single overall grade:
        one number reads as a verdict on the stock, and that is not a judgement this app
        makes.
      </Lead>

      <Section title="The rule in one line">
        <Equation />
        <Body>
          The four are <Strong>multiplied</Strong>, not averaged, so a weak reading on any
          one of them pulls a stock down rather than being hidden by the others.
        </Body>
        <MultiplyDemo />
      </Section>

      <Section title="The four measurements">
        <Cards cards={FACTORS.map(({ key, icon }) => ({
          icon,
          title: `${TERM_COPY[key].label}: ${TERM_COPY[key].question}`,
          body: TERM_COPY[key].detail,
          extra: <p className="border-t border-forest-900/10 pt-2 text-xs leading-relaxed text-forest-900">{FACTOR_RANGE[key]}</p>,
        }))} />
      </Section>

      <Section title="The headline on each stock">
        <Body>The chip at the top of every scorecard is the agreement reading in words.</Body>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(CONVERGENCE_HEADLINE) as ConvergenceState[]).map(state => (
            <li key={state} className="as-inset flex flex-col items-start gap-2 p-3">
              <span className={STATE_TONE[state]}>{CONVERGENCE_HEADLINE[state]}</span>
              <span className="text-xs leading-relaxed text-brand-muted-fg">{CONVERGENCE_DETAIL[state]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What is objective, and what is not">
        <Note>
          The measurements are reproducible: given the same public price and news data,
          anyone applying the same formulas gets the same numbers. How they are weighed
          against each other is our editorial choice, so we show it to you rather than
          calling it objective. Nothing here predicts a future price.
        </Note>
      </Section>

      <MoreDetail title="More detail">
        <Bullets items={[
          <>
            <Strong>Close calls keep their order.</Strong> When two stocks' results differ
            by less than {TIE_BAND}, they keep the previous night's order, so small noise
            does not reshuffle your list.
          </>,
          <>
            <Strong>Beyond your top {SHORTLIST_SIZE}.</Strong> The four measurements order
            the shortlist. The other stocks in the run, under "Also scored", are still
            listed by an older combined score: half the price measurements and half the
            sentiment score, with points taken off when hype is flagged and an adjustment
            for your risk profile. That older score is being retired.
          </>,
          <>
            <Strong>The reasoning trace.</Strong> For your top {SHORTLIST_SIZE}, an AI model
            writes the paragraph under "Why it ranks here" from these same figures. Other
            stocks get a standard sentence built from the same figures.
          </>,
        ]} />
      </MoreDetail>
    </>
  );
}
