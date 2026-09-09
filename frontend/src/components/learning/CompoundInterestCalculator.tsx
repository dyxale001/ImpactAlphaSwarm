import { useState } from 'react';
import { Leaf, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { calculateCompoundInterest, MAX_INVESTMENT_AMOUNT } from '../../utils/compoundInterest';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const compactCurrency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', notation: 'compact', maximumFractionDigits: 1 });
const fields = [
  { key: 'initialInvestment', label: 'Starting investment (R)', min: 0, max: MAX_INVESTMENT_AMOUNT, step: '0.01' },
  { key: 'monthlyContribution', label: 'Monthly contribution (R)', min: 0, max: MAX_INVESTMENT_AMOUNT, step: '0.01' },
  { key: 'annualRate', label: 'Expected annual return (%)', min: 0, max: 30, step: '0.1' },
  { key: 'years', label: 'Investment period (years)', min: 1, max: 60, step: '1' },
] as const;

export default function CompoundInterestCalculator() {
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
    <section className="min-w-0 space-y-6 rounded-3xl border border-brand-border bg-brand-card p-5 shadow-card sm:p-8" aria-labelledby="compound-title">
      <div className="space-y-2">
        <h3 id="compound-title" className="flex items-center gap-2 text-xl font-semibold text-brand-fg"><Leaf className="h-5 w-5 text-brand-primary" aria-hidden="true" />What could my investment grow to?</h3>
        <p className="text-sm text-brand-muted-fg">See how time, regular contributions and reinvested growth can work together. These example inputs are yours to explore.</p>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          {fields.map((field, index) => (
            <div key={field.key} className="space-y-2">
              <label htmlFor={`compound-${field.key}`} className="block text-sm font-medium text-brand-fg">{field.label}</label>
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
                className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-bg/60 px-4 py-3 text-brand-fg outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
              {(field.key === 'annualRate' || field.key === 'years') && (
                <input type="range" aria-label={`${field.label} slider`} min={field.min} max={field.max} step={field.step}
                  value={Number.isFinite(values[field.key]) ? Math.min(field.max, Math.max(field.min, values[field.key])) : field.min}
                  onChange={event => setInputs(current => ({ ...current, [field.key]: event.target.value }))}
                  className="h-6 w-full cursor-pointer accent-brand-primary" />
              )}
              {errors[index] && <p id={`compound-${field.key}-error`} className="text-xs text-semantic-danger">{errors[index]}</p>}
              {field.key === 'annualRate' && <p id="compound-rate-note" className="text-xs text-brand-muted-fg">Nominal annual rate, compounded monthly. An assumption you choose, not a predicted return.</p>}
            </div>
          ))}
        </div>
        <div className="min-w-0 self-start space-y-5 rounded-3xl bg-brand-primary p-5 text-brand-bg sm:p-7" aria-live="polite" aria-atomic="true">
          <TrendingUp className="h-7 w-7 text-brand-accent" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-bg/75">Projected Value</p>
          {result ? <>
            <p className="break-words text-3xl font-semibold tracking-tight text-brand-accent sm:text-4xl">{currency.format(result.projectedValue)}</p>
            <p className="text-sm text-brand-bg/75">After {values.years} {values.years === 1 ? 'year' : 'years'}</p>
            <dl className="grid min-w-0 gap-4 border-t border-white/15 pt-5 sm:grid-cols-2">
              <div><dt className="text-xs text-brand-bg/70">Total Contributed</dt><dd className="mt-1 break-words text-lg font-semibold">{currency.format(result.totalContributed)}</dd></div>
              <div><dt className="text-xs text-brand-bg/70">Investment Growth</dt><dd className="mt-1 break-words text-lg font-semibold">{currency.format(result.investmentGrowth)}</dd></div>
            </dl>
            <p className="text-sm leading-relaxed text-brand-bg/85">{result.projectedValue > 0 ? `${result.growthPercentage.toFixed(1)}% of the projected final value comes from investment growth.` : 'Add a starting investment or monthly contribution to explore growth.'}</p>
          </> : <p className="text-sm text-brand-bg/85">Complete the inputs with valid values to see your projection.</p>}
        </div>
      </div>
      <div className="min-w-0 space-y-3 border-t border-brand-border pt-6">
        <h4 className="font-semibold text-brand-fg">Your growth over time</h4>
        {result ? <div className="h-72 w-full min-w-0 sm:h-80" role="img" aria-label={`Illustrative growth over ${values.years} years: ${currency.format(result.projectedValue)} projected value, including ${currency.format(result.totalContributed)} contributed.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={result.timeline} margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--color-brand-border)" strokeDasharray="3 3" opacity={0.5} />
              <XAxis dataKey="year" tickFormatter={year => `Year ${year}`} minTickGap={25} tick={{ fill: 'var(--color-brand-muted-fg)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis width={72} tickFormatter={value => compactCurrency.format(value)} tick={{ fill: 'var(--color-brand-muted-fg)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip labelFormatter={year => `Year ${year}`} formatter={(value, name) => [currency.format(Number(value)), name]} contentStyle={{ background: 'var(--color-brand-card)', border: '1px solid var(--color-brand-border)', borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line name="Projected Portfolio Value" dataKey="projectedValue" stroke="var(--color-brand-primary)" strokeWidth={3} dot={false} isAnimationActive={false} />
              <Line name="Cumulative Contributions" dataKey="totalContributed" stroke="var(--color-brand-muted-fg)" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div> : <p className="py-8 text-sm text-brand-muted-fg">Your chart will appear when all inputs are valid.</p>}
        <p className="text-sm leading-relaxed text-brand-muted-fg">Contributions show the money you put in. The gap to projected value shows investment growth, including growth on earlier returns.</p>
        <p className="rounded-xl bg-brand-bg p-4 text-xs leading-relaxed text-brand-muted-fg">Illustrative projection: assumes a constant annual return, monthly compounding, reinvested growth and contributions at the end of each month. Excludes fees, tax and inflation. Actual investment returns will vary.</p>
      </div>
    </section>
  );
}
