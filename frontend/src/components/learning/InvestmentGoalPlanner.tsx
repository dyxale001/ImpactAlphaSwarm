import { useState, type ReactNode } from 'react';
import PurchasingPower from './PurchasingPower';
import { Target } from 'lucide-react';
import { calculateInvestmentGoal } from '../../utils/investmentGoal';
import { MAX_INVESTMENT_AMOUNT } from '../../utils/compoundInterest';
import { FIELD_ERROR, FIELD_INPUT, FIELD_LABEL, FIELD_RANGE, HowWorkedOut, RESULT_CARD, RESULT_LABEL, TOOL_CARD, ToolChart } from './toolChrome';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const fields = [
  { key: 'targetValue', label: 'Target value at the end of your plan (R)', min: 0.01, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'currentInvestment', label: 'Current investment (R)', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'annualRate', label: 'Expected annual return (%)', min: 0, max: 30, step: 0.1 },
  { key: 'years', label: 'Time horizon (years)', min: 1, max: 60, step: 1 },
] as const;

export default function InvestmentGoalPlanner({ inflationRate, onInflationChange, modeSwitch }: { inflationRate: string; onInflationChange?: (value: string) => void; /** The Project growth / Plan a goal tray, in the card's header. */ modeSwitch?: ReactNode }) {
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
    <section aria-labelledby="goal-title" className={TOOL_CARD}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 id="goal-title" className="flex items-center gap-2 text-lg font-bold tracking-[-0.015em] text-forest-900"><Target className="h-5 w-5 text-forest-700" aria-hidden="true" />How much might I need to invest to reach my target?</h3>
          <p className="text-sm leading-relaxed text-brand-muted-fg">Start with a target and explore the monthly investment that could help you reach it.</p>
        </div>
        {modeSwitch}
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-x-4 gap-y-5 sm:grid-cols-2">
          {fields.map((field, index) => <div key={field.key} className="space-y-2">
            <label htmlFor={`goal-${field.key}`} className={FIELD_LABEL}>{field.label}</label>
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
              className={FIELD_INPUT} />
            {(field.key === 'annualRate' || field.key === 'years') && <input type="range" aria-label={`${field.label} slider`} min={field.min} max={field.max} step={field.step}
              value={Number.isFinite(values[field.key]) ? Math.min(field.max, Math.max(field.min, values[field.key])) : field.min}
              onChange={event => setInputs(current => ({ ...current, [field.key]: event.target.value }))} className={FIELD_RANGE} />}
            {errors[index] && <p id={`goal-${field.key}-error`} className={FIELD_ERROR}>{errors[index]}</p>}
          </div>)}
        </div>
        <div className={RESULT_CARD} aria-live="polite" aria-atomic="true">
          <p className={`flex items-center gap-2 ${RESULT_LABEL}`}><Target className="h-4 w-4 text-lime-500" aria-hidden="true" />Required monthly contribution</p>
          {result ? <>
            <p className="break-words text-3xl font-bold tabular-nums tracking-[-0.02em] text-lime-500 sm:text-4xl">{result.monthlyContribution > 0 && result.monthlyContribution < 0.01 ? `Less than ${currency.format(0.01)}` : currency.format(result.monthlyContribution)}</p>
            <p className="text-sm leading-relaxed text-white/85">{result.achievableWithoutContributions ? 'Your current investment alone is projected to meet or exceed the target under these assumptions.' : `Approximately this amount each month could target ${currency.format(result.targetValue)} in ${values.years} years.`}</p>

            <dl className="grid min-w-0 gap-4 border-t border-white/15 pt-4 sm:grid-cols-2">
              <div><dt className={RESULT_LABEL}>Total future contributions</dt><dd className="mt-1 break-words text-lg font-bold tabular-nums">{currency.format(result.futureContributions)}</dd></div>
              <div><dt className={RESULT_LABEL}>Estimated investment growth</dt><dd className="mt-1 break-words text-lg font-bold tabular-nums">{currency.format(result.investmentGrowth)}</dd></div>
            </dl>
          </> : <p className="text-sm">Complete the inputs with valid values to see your plan.</p>}
        </div>
      </div>
      {result && <PurchasingPower futureValue={result.projectedValue} years={values.years} inflationRate={inflationRate} onInflationChange={onInflationChange} startingCapital={values.currentInvestment} monthlyContribution={result.monthlyContribution} targetValue={result.targetValue} />}
      {result && (
        <ToolChart
          title="Your path toward the target"
          data={result.timeline}
          series={[{ key: 'projectedValue', name: 'Projected portfolio value' }]}
          target={result.targetValue}
          label={`Projected final value ${currency.format(result.projectedValue)} toward a target of ${currency.format(result.targetValue)}.`}
          caption="Try increasing the time horizon or starting investment and watch the required monthly amount change. A higher assumed return can reduce that amount, but does not make the outcome more certain."
        />
      )}
      <HowWorkedOut>
        <p>Illustrative target, not a guarantee. Assumes a constant nominal annual return, monthly compounding, reinvested growth and month-end contributions. Nominal projections exclude fees, tax and inflation; the separate figure in today’s money uses your inflation assumption. Displayed amounts are rounded; projections use full precision. Actual returns will vary.</p>
      </HowWorkedOut>
    </section>
  );
}
