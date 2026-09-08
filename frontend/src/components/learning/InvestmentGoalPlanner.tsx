import { useState } from 'react';
import { Target } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { calculateInvestmentGoal } from '../../utils/investmentGoal';
import { MAX_INVESTMENT_AMOUNT } from '../../utils/compoundInterest';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const compactCurrency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', notation: 'compact', maximumFractionDigits: 1 });
const fields = [
  { key: 'targetValue', label: 'Target investment value (R)', min: 0.01, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'currentInvestment', label: 'Current investment (R)', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'annualRate', label: 'Expected annual return (%)', min: 0, max: 30, step: 0.1 },
  { key: 'years', label: 'Time horizon (years)', min: 1, max: 60, step: 1 },
] as const;

export default function InvestmentGoalPlanner() {
  const [inputs, setInputs] = useState({ targetValue: '1000000', currentInvestment: '10000', annualRate: '7', years: '20' });
  const values = { targetValue: Number(inputs.targetValue), currentInvestment: Number(inputs.currentInvestment), annualRate: Number(inputs.annualRate), years: Number(inputs.years) };
  const errors = fields.map(field => {
    const value = values[field.key];
    if (!inputs[field.key].trim()) return 'Enter a value.';
    if (!Number.isFinite(value) || value < field.min || value > field.max) return `Enter a value from ${field.min} to ${field.max.toLocaleString('en-ZA')}.`;
    return field.key === 'years' && !Number.isInteger(value) ? 'Use whole years.' : '';
  });
  const result = errors.some(Boolean) ? null : calculateInvestmentGoal(values);
  return (
    <section aria-labelledby="goal-title" className="min-w-0 space-y-6 rounded-3xl border border-brand-border bg-brand-card p-5 shadow-card sm:p-8">
      <div className="space-y-2">
        <h3 id="goal-title" className="flex items-center gap-2 text-xl font-semibold text-brand-fg"><Target className="h-5 w-5 text-brand-primary" aria-hidden="true" />How much might I need to invest to reach my target?</h3>
        <p className="text-sm leading-relaxed text-brand-muted-fg">Start with a target and explore the monthly investment that could help you reach it.</p>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          {fields.map((field, index) => <div key={field.key} className="space-y-2">
            <label htmlFor={`goal-${field.key}`} className="block text-sm font-medium text-brand-fg">{field.label}</label>
            <input id={`goal-${field.key}`} type="number" inputMode={field.key === 'years' ? 'numeric' : 'decimal'} min={field.key === 'targetValue' ? 0 : field.min} max={field.max} step={field.step} value={inputs[field.key]}
              onKeyDown={event => { if (event.key === '-') event.preventDefault(); }}
              onPaste={event => { if (event.clipboardData.getData('text').includes('-')) event.preventDefault(); }}
              onChange={event => {
                let value = event.target.value;
                if (value.includes('-') || Number(value) < 0) return;
                const numeric = Number(value);
                if (field.key === 'annualRate' && value.trim() && Number.isFinite(numeric) && numeric >= 0 && numeric <= 30) {
                  const rounded = Math.round(numeric * 10) / 10;
                  if (rounded !== numeric) value = String(rounded);
                }
                setInputs(current => ({ ...current, [field.key]: value }));
              }} aria-invalid={Boolean(errors[index])} aria-describedby={errors[index] ? `goal-${field.key}-error` : undefined}
              className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-bg/60 px-4 py-3 text-brand-fg outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
            {(field.key === 'annualRate' || field.key === 'years') && <input type="range" aria-label={`${field.label} slider`} min={field.min} max={field.max} step={field.step}
              value={Number.isFinite(values[field.key]) ? Math.min(field.max, Math.max(field.min, values[field.key])) : field.min}
              onChange={event => setInputs(current => ({ ...current, [field.key]: event.target.value }))} className="h-6 w-full cursor-pointer accent-brand-primary" />}
            {errors[index] && <p id={`goal-${field.key}-error`} className="text-xs text-semantic-danger">{errors[index]}</p>}
          </div>)}
        </div>
        <div className="min-w-0 self-start space-y-5 rounded-3xl bg-brand-primary p-5 text-brand-bg sm:p-7" aria-live="polite" aria-atomic="true">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-bg/75">Required monthly contribution</p>
          {result ? <>
            <p className="break-words text-3xl font-semibold tracking-tight text-brand-accent sm:text-4xl">{result.monthlyContribution > 0 && result.monthlyContribution < 0.01 ? `Less than ${currency.format(0.01)}` : currency.format(result.monthlyContribution)}</p>
            <p className="text-sm leading-relaxed text-brand-bg/85">{result.achievableWithoutContributions ? 'Your current investment alone is projected to meet or exceed the target under these assumptions.' : `Approximately this amount each month could target ${currency.format(result.targetValue)} in ${values.years} years.`}</p>
            <dl className="space-y-4 border-t border-white/15 pt-5 text-sm">
              <div><dt className="text-brand-bg/70">Total future contributions</dt><dd className="break-words font-semibold">{currency.format(result.futureContributions)}</dd></div>
              <div><dt className="text-brand-bg/70">Estimated investment growth</dt><dd className="break-words font-semibold">{currency.format(result.investmentGrowth)}</dd></div>
            </dl>
          </> : <p className="text-sm">Complete the inputs with valid values to see your plan.</p>}
        </div>
      </div>
      {result && <div className="min-w-0 space-y-3 border-t border-brand-border pt-6">
        <h4 className="font-semibold text-brand-fg">Your path toward the target</h4>
        <div className="h-72 w-full min-w-0 sm:h-80" role="img" aria-label={`Projected final value ${currency.format(result.projectedValue)} toward a target of ${currency.format(result.targetValue)}.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={result.timeline} margin={{ top: 25, right: 14, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--color-brand-border)" strokeDasharray="3 3" opacity={0.5} />
              <XAxis dataKey="year" tickFormatter={year => `Year ${year}`} minTickGap={25} tick={{ fill: 'var(--color-brand-muted-fg)', fontSize: 11 }} />
              <YAxis width={72} tickFormatter={value => compactCurrency.format(value)} tick={{ fill: 'var(--color-brand-muted-fg)', fontSize: 11 }} />
              <Tooltip labelFormatter={year => `Year ${year}`} formatter={(value, name) => [currency.format(Number(value)), name]} contentStyle={{ background: 'var(--color-brand-card)', border: '1px solid var(--color-brand-border)', borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={result.targetValue} ifOverflow="extendDomain" stroke="var(--color-brand-muted-fg)" strokeDasharray="5 4" label={{ value: 'Target', position: 'insideTopRight', fill: 'var(--color-brand-muted-fg)' }} />
              <Line name="Projected Portfolio Value" dataKey="projectedValue" stroke="var(--color-brand-primary)" strokeWidth={3} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>}
      <p className="text-sm leading-relaxed text-brand-muted-fg">Try increasing the time horizon or starting investment and watch the required monthly amount change. A higher assumed return can reduce that amount, but does not make the outcome more certain.</p>
      <p className="rounded-xl bg-brand-bg p-4 text-xs leading-relaxed text-brand-muted-fg">Illustrative target, not a guarantee. Assumes a constant nominal annual return, monthly compounding, reinvested growth and month-end contributions. Excludes fees, tax and inflation. Displayed amounts are rounded; projections use full precision. Actual returns will vary.</p>
    </section>
  );
}
