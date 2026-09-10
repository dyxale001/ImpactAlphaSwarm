import { useState } from 'react';
import { Sprout } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { calculateTFSAPlan, southAfricanDate, tfsaTaxYear, TFSA_RULES } from '../../utils/tfsaPlanner';
import { MAX_INVESTMENT_AMOUNT } from '../../utils/compoundInterest';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const compactCurrency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', notation: 'compact', maximumFractionDigits: 1 });
const fields = [
  { key: 'priorLifetimeContributions', label: 'Contributions before this tax year (R)', hint: 'Total deposits across all your TFSAs before 1 March. Do not subtract withdrawals.', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'currentYearContributions', label: 'Contributions already made this tax year (R)', hint: 'Deposits since 1 March across all TFSAs. Exclude these from the previous field.', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'currentValue', label: 'Current TFSA value (R)', hint: 'Combined account value today, including growth. This is separate from contribution history.', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'monthlyContribution', label: 'Planned monthly contribution (R)', hint: 'Additional deposits, starting at the end of the planning month.', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'annualRate', label: 'Expected annual return (%)', hint: 'Your nominal annual return assumption, compounded monthly.', min: 0, max: 30, step: 0.1 },
  { key: 'years', label: 'Investment period (years)', hint: 'From the planning month; current rules are held constant for illustration.', min: 1, max: 60, step: 1 },
] as const;

export default function TFSAPlanner() {
  const [inputs, setInputs] = useState(() => ({ priorLifetimeContributions: '0', currentYearContributions: '0', currentValue: '0', monthlyContribution: '1000', annualRate: '7', years: '20', referenceDate: southAfricanDate(new Date()) }));
  const values = { priorLifetimeContributions: Number(inputs.priorLifetimeContributions), currentYearContributions: Number(inputs.currentYearContributions), currentValue: Number(inputs.currentValue), monthlyContribution: Number(inputs.monthlyContribution), annualRate: Number(inputs.annualRate), years: Number(inputs.years), referenceDate: inputs.referenceDate };
  const errors = fields.map(field => {
    const value = values[field.key];
    if (!inputs[field.key].trim()) return 'Enter a value.';
    if (!Number.isFinite(value) || value < field.min || value > field.max) return `Enter a value from ${field.min} to ${field.max.toLocaleString('en-ZA')}.`;
    return field.key === 'years' && !Number.isInteger(value) ? 'Use whole years.' : '';
  });
  let dateError = '';
  try { tfsaTaxYear(inputs.referenceDate); } catch (error) { dateError = error instanceof Error ? error.message : 'Enter a valid planning date.'; }
  const result = errors.some(Boolean) || dateError ? null : calculateTFSAPlan(values);
  return (
    <section aria-labelledby="tfsa-title" className="min-w-0 space-y-6 rounded-3xl border border-brand-border bg-brand-card p-5 shadow-card sm:p-8">
      <div className="space-y-2">
        <h3 id="tfsa-title" className="flex items-center gap-2 text-xl font-semibold text-brand-fg"><Sprout className="h-5 w-5 text-brand-primary" aria-hidden="true" />TFSA Planner</h3>
        <p className="text-sm leading-relaxed text-brand-muted-fg">Understand your contribution room, then explore how your investment could grow. Use totals across all your tax-free savings accounts.</p>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="tfsa-date" className="block text-sm font-medium text-brand-fg">Planning date</label>
            <input id="tfsa-date" type="date" min={TFSA_RULES.effectiveFrom} value={inputs.referenceDate} onChange={event => setInputs(current => ({ ...current, referenceDate: event.target.value }))}
              aria-invalid={Boolean(dateError)} aria-describedby={dateError ? 'tfsa-date-error' : 'tfsa-date-note'} className="min-h-11 w-full min-w-0 rounded-xl border border-brand-border bg-brand-bg/60 px-4 py-3 text-brand-fg focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
            <p id="tfsa-date-note" className="text-xs text-brand-muted-fg">Initially today in South Africa. The tax year runs March–February. Include an additional payment this month only if you still plan to make it. Projections are monthly: the selected planning month is treated as a full month, with the planned contribution occurring at month-end. Interest is not prorated by day.</p>
            {dateError && <p id="tfsa-date-error" className="text-xs text-semantic-danger">{dateError}</p>}
          </div>
          {fields.map((field, index) => <div key={field.key} className="space-y-2">
            <label htmlFor={`tfsa-${field.key}`} className="block text-sm font-medium text-brand-fg">{field.label}</label>
            <input id={`tfsa-${field.key}`} type="number" inputMode={field.key === 'years' ? 'numeric' : 'decimal'} min={field.min} max={field.max} step={field.step} value={inputs[field.key]}
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
              }} aria-invalid={Boolean(errors[index])} aria-describedby={`tfsa-${field.key}-hint${errors[index] ? ` tfsa-${field.key}-error` : ''}`}
              className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-bg/60 px-4 py-3 text-brand-fg outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
            {(field.key === 'annualRate' || field.key === 'years') && <input type="range" aria-label={`${field.label} slider`} min={field.min} max={field.max} step={field.step}
              value={Number.isFinite(values[field.key]) ? Math.min(field.max, Math.max(field.min, values[field.key])) : field.min}
              onChange={event => setInputs(current => ({ ...current, [field.key]: event.target.value }))} className="h-6 w-full cursor-pointer accent-brand-primary" />}
            <p id={`tfsa-${field.key}-hint`} className="text-xs text-brand-muted-fg">{field.hint}</p>
            {errors[index] && <p id={`tfsa-${field.key}-error`} className="text-xs text-semantic-danger">{errors[index]}</p>}
          </div>)}
        </div>
        <div className="min-w-0 space-y-5" aria-live="polite">
          {result ? <>
            <div className="space-y-3 rounded-2xl border border-brand-border bg-brand-bg/60 p-5">
              <h4 className="font-semibold text-brand-fg">Your annual allowance · {result.taxYear.startYear}/{result.taxYear.endYear}</h4>
              <p className="break-words text-sm text-brand-muted-fg">{currency.format(values.currentYearContributions)} used / {currency.format(TFSA_RULES.annualLimit)}</p>
              <progress aria-label="Annual contribution allowance used" max={TFSA_RULES.annualLimit} value={Math.min(values.currentYearContributions, TFSA_RULES.annualLimit)} className="h-2.5 w-full accent-brand-primary" />
              <p className="break-words text-lg font-semibold text-brand-primary">{currency.format(result.annualRemaining)} remaining</p>
              {result.annualExcessAlready > 0 && <p className="text-sm text-semantic-danger">Already over the annual limit by {currency.format(result.annualExcessAlready)}.</p>}
              {result.annualExcessWithPlan > 0 && <p className="text-sm text-semantic-danger">Your plan would put this tax year {currency.format(result.annualExcessWithPlan)} over the annual limit.</p>}
              {result.firstAnnualBreach && result.firstAnnualBreach.startYear !== result.taxYear.startYear && <p className="text-sm text-semantic-danger">Your schedule first exceeds the annual limit in {result.firstAnnualBreach.startYear}/{result.firstAnnualBreach.startYear + 1}, by {currency.format(result.firstAnnualBreach.excess)}.</p>}
            </div>
            <div className="space-y-3 rounded-2xl border border-brand-border bg-brand-bg/60 p-5">
              <h4 className="font-semibold text-brand-fg">Your lifetime allowance</h4>
              <p className="break-words text-sm text-brand-muted-fg">{currency.format(result.lifetimeUsed)} used / {currency.format(TFSA_RULES.lifetimeLimit)}</p>
              <progress aria-label="Lifetime contribution allowance used" max={TFSA_RULES.lifetimeLimit} value={Math.min(result.lifetimeUsed, TFSA_RULES.lifetimeLimit)} className="h-2.5 w-full accent-brand-primary" />
              <p className="break-words text-lg font-semibold text-brand-primary">{currency.format(result.lifetimeRemaining)} remaining</p>
              {result.lifetimeExcessAlready > 0 && <p className="text-sm text-semantic-danger">Already over the lifetime limit by {currency.format(result.lifetimeExcessAlready)}.</p>}
              {result.lifetimeExcessThisTaxYear > 0 && <p className="text-sm text-semantic-danger">By tax-year end, lifetime contributions would be {currency.format(result.lifetimeExcessThisTaxYear)} over the lifetime limit.</p>}
              {result.lifetimeExcessAtHorizon > 0 && <p className="text-sm text-semantic-danger">Over {values.years} years, this schedule would exceed lifetime contribution room by {currency.format(result.lifetimeExcessAtHorizon)}. Reduce or stop contributions before exceeding the limit.</p>}
            </div>
            <div className="min-w-0 space-y-3 rounded-3xl bg-brand-primary p-5 text-brand-bg sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-bg/75">Illustrative future account value</p>
              <p className="break-words text-3xl font-semibold text-brand-accent">{currency.format(result.projection.projectedValue)}</p>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-brand-bg/70">Future contributions</dt><dd className="break-words font-semibold">{currency.format(result.plannedFutureContributions)}</dd></div>
                <div><dt className="text-brand-bg/70">Future investment growth</dt><dd className="break-words font-semibold">{currency.format(result.projection.investmentGrowth)}</dd></div>
              </dl>
              <p className="text-xs leading-relaxed text-brand-bg/85">Uses your entered schedule without capping contributions. Excludes excess-contribution tax; this is not a compliant-plan recommendation. Review any allowance warnings above.</p>
            </div>
          </> : <p className="rounded-2xl bg-brand-bg p-5 text-sm text-brand-muted-fg">Complete the inputs with valid values to see your allowances and projection.</p>}
        </div>
      </div>
      {result && <div className="min-w-0 space-y-3 border-t border-brand-border pt-6">
        <h4 className="font-semibold text-brand-fg">Account value and future deposits</h4>
        <div className="h-72 w-full min-w-0 sm:h-80" role="img" aria-label={`Illustrative account value after ${values.years} years: ${currency.format(result.projection.projectedValue)}. Future contributions: ${currency.format(result.plannedFutureContributions)}.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={result.projection.timeline} margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--color-brand-border)" strokeDasharray="3 3" opacity={0.5} />
              <XAxis dataKey="year" tickFormatter={year => `Year ${year}`} minTickGap={25} tick={{ fill: 'var(--color-brand-muted-fg)', fontSize: 11 }} />
              <YAxis width={72} tickFormatter={value => compactCurrency.format(value)} tick={{ fill: 'var(--color-brand-muted-fg)', fontSize: 11 }} />
              <Tooltip labelFormatter={year => `Year ${year}`} formatter={(value, name) => [currency.format(Number(value)), name]} contentStyle={{ background: 'var(--color-brand-card)', border: '1px solid var(--color-brand-border)', borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line name="Projected Account Value" dataKey="projectedValue" stroke="var(--color-brand-primary)" strokeWidth={3} dot={false} isAnimationActive={false} />
              <Line name="Starting Value + Future Deposits" dataKey="totalContributed" stroke="var(--color-brand-muted-fg)" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs leading-relaxed text-brand-muted-fg">The chart starts with your current account value, which may include past growth. Neither line represents lifetime contribution allowance used.</p>
      </div>}
      <div className="space-y-2 rounded-xl bg-brand-bg p-4 text-xs leading-relaxed text-brand-muted-fg">
        <p>Contribution limits apply across all your TFSAs, not to market value. Growth can take account value above {currency.format(TFSA_RULES.lifetimeLimit)} without using more contribution room. Unused annual allowance does not carry forward. Withdrawals do not restore room: reinvested money counts as another contribution.</p>
        <p>Current SARS rules impose a {TFSA_RULES.excessContributionTaxRate * 100}% tax on excess contributions. This planner flags excess amounts, but does not calculate your tax liability.</p>
        <p>Rules effective 1 March 2026; future rules may change. Projections assume a constant nominal return, monthly compounding, reinvested growth and month-end deposits. They exclude fees, tax and inflation. Educational illustration, not personalised tax advice. <a href={TFSA_RULES.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-primary underline underline-offset-4">Read the SARS TFSA guidance</a>.</p>
      </div>
    </section>
  );
}
