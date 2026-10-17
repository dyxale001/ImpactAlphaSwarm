import { useState, type ReactNode } from 'react';
import PurchasingPower from './PurchasingPower';
import { Leaf, TrendingUp } from 'lucide-react';
import { calculateCompoundInterest, MAX_INVESTMENT_AMOUNT } from '../../utils/compoundInterest';
import { FIELD_ERROR, FIELD_HINT, FIELD_INPUT, FIELD_LABEL, FIELD_RANGE, HowWorkedOut, RESULT_CARD, RESULT_LABEL, TOOL_CARD, ToolChart } from './toolChrome';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const fields = [
  { key: 'initialInvestment', label: 'Starting investment (R)', min: 0, max: MAX_INVESTMENT_AMOUNT, step: '0.01' },
  { key: 'monthlyContribution', label: 'Monthly contribution (R)', min: 0, max: MAX_INVESTMENT_AMOUNT, step: '0.01' },
  { key: 'annualRate', label: 'Expected annual return (%)', min: 0, max: 30, step: '0.1' },
  { key: 'years', label: 'Investment period (years)', min: 1, max: 60, step: '1' },
] as const;

export default function CompoundInterestCalculator({ inflationRate, onInflationChange, modeSwitch }: { inflationRate: string; onInflationChange?: (value: string) => void; /** The Project growth / Plan a goal tray, in the card's header. */ modeSwitch?: ReactNode }) {
  const [inputs, setInputs] = useState({ initialInvestment: '10000', monthlyContribution: '1000', annualRate: '7', years: '20' });
  const values = { initialInvestment: Number(inputs.initialInvestment), monthlyContribution: Number(inputs.monthlyContribution), annualRate: Number(inputs.annualRate), years: Number(inputs.years) };
  const errors = fields.map(field => {
    const value = values[field.key];
    if (!inputs[field.key].trim()) return 'Enter a value.';
    if (!Number.isFinite(value)) return 'Enter a finite number.';
    if (value < field.min || value > field.max) return `Use a value from ${field.min} to ${field.max.toLocaleString('en-ZA')}.`;
    if (field.key === 'years' && !Number.isInteger(value)) return 'Use whole years.';
    return '';
  });
  const result = errors.some(Boolean) ? null : calculateCompoundInterest(values);

  return (
    <section className={TOOL_CARD} aria-labelledby="compound-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 id="compound-title" className="flex items-center gap-2 text-lg font-bold tracking-[-0.015em] text-forest-900"><Leaf className="h-5 w-5 text-forest-700" aria-hidden="true" />What could my investment grow to?</h3>
          <p className="text-sm text-brand-muted-fg">See how time, regular contributions and reinvested growth can work together. These example inputs are yours to explore.</p>
        </div>
        {modeSwitch}
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-x-4 gap-y-5 sm:grid-cols-2">
          {fields.map((field, index) => (
            <div key={field.key} className="space-y-2">
              <label htmlFor={`compound-${field.key}`} className={FIELD_LABEL}>{field.label}</label>
              <input id={`compound-${field.key}`} type="number" inputMode={field.key === 'years' ? 'numeric' : 'decimal'} min={field.min} max={field.max} step={field.step}
                value={inputs[field.key]}
                onKeyDown={event => { if (event.key === '-') event.preventDefault(); }}
                onPaste={event => { if (event.clipboardData.getData('text').includes('-')) event.preventDefault(); }}
                onChange={event => {
                  let value = event.target.value;
                  if (value.includes('-') || Number(value) < 0) return;
                  if (field.key === 'annualRate' && value.trim()) {
                    const rate = Number(value);
                    if (Number.isFinite(rate) && rate >= field.min && rate <= field.max) {
                      const roundedRate = Math.round(rate * 10) / 10;
                      if (roundedRate !== rate) value = String(roundedRate);
                    }
                  }
                  setInputs(current => ({ ...current, [field.key]: value }));
                }}
                aria-invalid={Boolean(errors[index])} aria-describedby={errors[index] ? `compound-${field.key}-error` : field.key === 'annualRate' ? 'compound-rate-note' : undefined}
                className={FIELD_INPUT} />
              {(field.key === 'annualRate' || field.key === 'years') && (
                <input type="range" aria-label={`${field.label} slider`} min={field.min} max={field.max} step={field.step}
                  value={Number.isFinite(values[field.key]) ? Math.min(field.max, Math.max(field.min, values[field.key])) : field.min}
                  onChange={event => setInputs(current => ({ ...current, [field.key]: event.target.value }))}
                  className={FIELD_RANGE} />
              )}
              {errors[index] && <p id={`compound-${field.key}-error`} className={FIELD_ERROR}>{errors[index]}</p>}
              {field.key === 'annualRate' && <p id="compound-rate-note" className={FIELD_HINT}>Nominal annual rate, compounded monthly. An assumption you choose, not a predicted return.</p>}
            </div>
          ))}
        </div>
        <div className={RESULT_CARD} aria-live="polite" aria-atomic="true">
          <p className={`flex items-center gap-2 ${RESULT_LABEL}`}><TrendingUp className="h-4 w-4 text-lime-500" aria-hidden="true" />Projected value</p>
          {result ? <>
            <div>
              <p className="break-words text-3xl font-bold tabular-nums tracking-[-0.02em] text-lime-500 sm:text-4xl">{currency.format(result.projectedValue)}</p>
              <p className="mt-1 text-sm text-white/70">After {values.years} {values.years === 1 ? 'year' : 'years'}</p>
            </div>
            <dl className="grid min-w-0 gap-4 border-t border-white/15 pt-4 sm:grid-cols-2">
              <div><dt className={RESULT_LABEL}>Total contributed</dt><dd className="mt-1 break-words text-lg font-bold tabular-nums">{currency.format(result.totalContributed)}</dd></div>
              <div><dt className={RESULT_LABEL}>Investment growth</dt><dd className="mt-1 break-words text-lg font-bold tabular-nums">{currency.format(result.investmentGrowth)}</dd></div>
            </dl>
            <p className="text-sm leading-relaxed text-white/85">{result.projectedValue > 0 ? `${result.growthPercentage.toFixed(1)}% of the projected final value comes from investment growth.` : 'Add a starting investment or monthly contribution to explore growth.'}</p>
          </> : <p className="text-sm text-white/85">Complete the inputs with valid values to see your projection.</p>}
        </div>
      </div>
      {result && <PurchasingPower futureValue={result.projectedValue} years={values.years} inflationRate={inflationRate} onInflationChange={onInflationChange} startingCapital={values.initialInvestment} monthlyContribution={values.monthlyContribution} />}
      {result ? (
        <ToolChart
          title="Your growth over time"
          data={result.timeline}
          series={[{ key: 'projectedValue', name: 'Projected portfolio value' }, { key: 'totalContributed', name: 'Cumulative contributions' }]}
          label={`Illustrative growth over ${values.years} years: ${currency.format(result.projectedValue)} projected value, including ${currency.format(result.totalContributed)} contributed.`}
          caption="Contributions show the money you put in. The gap to projected value shows investment growth, including growth on earlier returns."
        />
      ) : <p className="as-inset p-5 text-sm text-brand-muted-fg">Your chart will appear when all inputs are valid.</p>}
      <HowWorkedOut>
        <p>Illustrative projection: assumes a constant annual return, monthly compounding, reinvested growth and contributions at the end of each month. Nominal projections exclude fees, tax and inflation; the separate figure in today’s money uses your inflation assumption. Actual investment returns will vary.</p>
      </HowWorkedOut>
    </section>
  );
}
