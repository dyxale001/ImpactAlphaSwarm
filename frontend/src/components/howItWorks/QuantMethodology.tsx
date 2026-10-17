import { Calculator, Ruler, Tags } from 'lucide-react';
import {
  QUANT_HORIZONS,
  QUANT_TRACE_DISCLOSURE,
  RAW_METRICS,
  SUB_DIMENSION_DIRECTION,
  SUB_DIMENSION_ORDER,
  SUB_DIMENSIONS,
} from '../../data/quantExplainers';
import { QUANT_MIN_UNIVERSE, SHORTLIST_SIZE } from '../../data/rankingMethodology';
import { BandStrip, Body, Bullets, Cards, Lead, MoreDetail, Note, Section, Steps, Strong } from './MethodologyParts';

// The price measurements: what is measured, how it is compared with the run's other
// stocks, and which readings are deliberately only described.

const PEERS = [6, 14, 23, 31, 40, 47, 55, 63, 71, 86, 94];
const DEMO_PCT = 78;

/** Where one stock sits among the run's stocks, as dots on a 0-100 track. */
function PercentileDemo() {
  return (
    <div className="as-inset p-4" role="img"
      aria-label={`Illustration: a stock at the ${DEMO_PCT}th percentile sits above about 8 in 10 of the stocks in its run`}>
      <div className="relative mx-2 h-10" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-forest-100" />
        {PEERS.map(p => (
          <span key={p} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-forest-500/60" style={{ left: `${p}%` }} />
        ))}
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest-700 shadow" style={{ left: `${DEMO_PCT}%` }} />
        <span className="absolute -top-1 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-forest-900" style={{ left: `${DEMO_PCT}%` }}>This stock</span>
      </div>
      <div className="mx-2 flex justify-between text-[11px] text-brand-muted-fg" aria-hidden="true">
        <span>Lowest in the run</span>
        <span>Highest</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg">
        {DEMO_PCT}th percentile: above about 8 in 10 of the other stocks analysed in the
        same run. A position among peers, not a rating.
      </p>
    </div>
  );
}

export default function QuantMethodology() {
  return (
    <>
      <Lead>
        Facts about how the price has behaved over roughly the last year, compared with
        the other stocks analysed in the same run. Deliberately not a rating.
      </Lead>

      <Section title="How it is measured">
        <Steps steps={[
          {
            icon: Calculator, title: 'Measure',
            body: <>About a year of daily prices, run through standard published formulas. The same window and formula give the same answer, whoever runs it.</>,
          },
          {
            icon: Ruler, title: 'Compare with peers',
            body: <>Three readings become a percentile: where the stock sits among the other stocks in the same run.</>,
          },
          {
            icon: Tags, title: 'Describe, never rank',
            body: <>RSI and beta are shown as labelled ranges instead, because neither extreme is simply better.</>,
          },
        ]} />
      </Section>

      <Section title="Position among peers">
        <PercentileDemo />
        <Body>Each ranked reading says which way is which, because it differs per row:</Body>
        <ul className="grid gap-2 sm:grid-cols-3">
          {SUB_DIMENSION_ORDER.map(key => (
            <li key={key} className="as-inset flex flex-col gap-1.5 p-3">
              <span className="text-sm font-bold text-forest-900">{SUB_DIMENSIONS[key].label}</span>
              <span className="text-xs leading-relaxed text-brand-muted-fg">{SUB_DIMENSION_DIRECTION[key]}</span>
            </li>
          ))}
        </ul>
        <Body>
          With fewer than {QUANT_MIN_UNIVERSE} comparable stocks in a run, a ranking would
          mean little, so the page shows the measurements and says the ranking was not
          possible rather than inventing a position.
        </Body>
      </Section>

      <Section title="Shown as ranges, never ranked">
        <p className="text-sm font-semibold text-forest-900">RSI, how fast and far the price has moved recently</p>
        <BandStrip label="RSI ranges" bands={[
          { name: 'Oversold', range: 'Below 30', className: 'bg-forest-100 text-forest-700' },
          { name: 'Neutral', range: '30 to 70', className: 'bg-forest-50 text-forest-700' },
          { name: 'Overbought', range: 'Above 70', className: 'bg-forest-100 text-forest-700' },
        ]} />
        <p className="pt-1 text-sm font-semibold text-forest-900">Beta, how the price moves with the S&amp;P 500</p>
        <BandStrip label="Beta ranges" bands={[
          { name: 'Moves opposite', range: 'Below 0', className: 'bg-forest-100 text-forest-700' },
          { name: 'Moves less', range: '0 to 0.8', className: 'bg-forest-50 text-forest-700' },
          { name: 'In step', range: '0.8 to 1.2', className: 'bg-forest-50 text-forest-700' },
          { name: 'Moves more', range: 'Above 1.2', className: 'bg-forest-100 text-forest-700' },
        ]} />
        <Body>
          Saying "RSI 28 is in the conventional oversold range" is true by convention,
          like saying 28°C is above room temperature. It is not a claim about what the
          price will do next.
        </Body>
      </Section>

      <Section title="Every measurement">
        <Cards cards={[
          ...RAW_METRICS.map(m => ({ title: m.label, body: m.detail })),
          { title: 'Total price change', body: 'How much the price rose or fell across the analysis window. Together with the MACD histogram it makes up momentum.' },
        ]} />
      </Section>

      <Section title="Why there is no single quant score">
        <Note>
          An older version folded these measurements into one score where higher meant
          better, with rules such as "oversold, therefore add points". That bundles a
          forecast and a value judgement into one number, so it is no longer shown and no
          longer decides your top {SHORTLIST_SIZE}. What you see instead is every
          measurement, its position among peers and what it means.
        </Note>
      </Section>

      <MoreDetail title="More detail">
        <Bullets items={[
          <><Strong>The formulas.</Strong> RSI uses 14 days with Wilder's smoothing; MACD uses 12, 26 and 9 day averages; the Sharpe ratio takes a 2% risk-free rate over 252 trading days a year; volatility is the annualised spread of daily moves; beta is measured against the S&amp;P 500 over the same window.</>,
          <><Strong>"The same run".</Strong> The nightly run measures every stock analysed that night together, so the peers are all of those stocks, not only your own list.</>,
          <><Strong>The chart.</Strong> The Quant tab draws the closing price and each day's RSI over {QUANT_HORIZONS.join(', ')} windows, converted to rand at one stated rate so the share's moves and the exchange rate's moves stay apart.</>,
          <><Strong>The written summary.</Strong> Where the Quant tab shows a written summary, it is {QUANT_TRACE_DISCLOSURE.charAt(0).toLowerCase() + QUANT_TRACE_DISCLOSURE.slice(1)}</>,
        ]} />
      </MoreDetail>
    </>
  );
}
