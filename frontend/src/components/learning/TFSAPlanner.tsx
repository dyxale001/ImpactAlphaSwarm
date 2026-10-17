import { useState } from 'react';
import PurchasingPower from './PurchasingPower';
import { Sprout } from 'lucide-react';
import { calculateTFSAPlan, southAfricanDate, tfsaTaxYear, TFSA_RULES } from '../../utils/tfsaPlanner';
import { MAX_INVESTMENT_AMOUNT } from '../../utils/compoundInterest';
import { FIELD_ERROR, FIELD_HINT, FIELD_INPUT, FIELD_LABEL, FIELD_RANGE, HowWorkedOut, RESULT_CARD, RESULT_LABEL, TOOL_CARD, ToolChart } from './toolChrome';

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

// An allowance used, as a rounded bar: forest within the limit, red once over it.
function AllowanceBar({ label, used, limit, over }: { label: string; used: number; limit: number; over: boolean }) {
  const pct = Math.min(100, (Math.min(used, limit) / limit) * 100);
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
      <div className={`h-full rounded-full ${over ? 'bg-down' : 'bg-forest-700'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
const fields = [
  { key: 'priorLifetimeContributions', label: 'Contributions before this tax year (R)', hint: 'Total deposits across all your TFSAs before 1 March. Do not subtract withdrawals.', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'currentYearContributions', label: 'Contributions already made this tax year (R)', hint: 'Deposits since 1 March across all TFSAs. Exclude these from the previous field.', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'currentValue', label: 'Current TFSA value (R)', hint: 'Combined account value today, including growth. This is separate from contribution history.', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'monthlyContribution', label: 'Planned monthly contribution (R)', hint: 'Additional deposits, starting at the end of the planning month.', min: 0, max: MAX_INVESTMENT_AMOUNT, step: 0.01 },
  { key: 'annualRate', label: 'Expected annual return (%)', hint: 'Your nominal annual return assumption, compounded monthly.', min: 0, max: 30, step: 0.1 },
  { key: 'years', label: 'Investment period (years)', hint: 'From the planning month; current rules are held constant for illustration.', min: 1, max: 60, step: 1 },
] as const;

export default function TFSAPlanner({ inflationRate, onInflationChange }: { inflationRate: string; onInflationChange?: (value: string) => void }) {
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
    <section aria-labelledby="tfsa-title" className={TOOL_CARD}>
      <div className="space-y-1">
        <h3 id="tfsa-title" className="flex items-center gap-2 text-lg font-bold tracking-[-0.015em] text-forest-900"><Sprout className="h-5 w-5 text-forest-700" aria-hidden="true" />TFSA Planner</h3>
        <p className="text-sm leading-relaxed text-brand-muted-fg">Understand your contribution room, then explore how your investment could grow. Use totals across all your tax-free savings accounts.</p>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-x-4 gap-y-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="tfsa-date" className={FIELD_LABEL}>Planning date</label>
            <input id="tfsa-date" type="date" min={TFSA_RULES.effectiveFrom} value={inputs.referenceDate} onChange={event => setInputs(current => ({ ...current, referenceDate: event.target.value }))}
              aria-invalid={Boolean(dateError)} aria-describedby={dateError ? 'tfsa-date-error' : 'tfsa-date-note'} className={`${FIELD_INPUT} sm:max-w-xs`} />
            <p id="tfsa-date-note" className={FIELD_HINT}>Initially today in South Africa. The tax year runs March–February. Include an additional payment this month only if you still plan to make it.</p>
            {dateError && <p id="tfsa-date-error" className={FIELD_ERROR}>{dateError}</p>}
          </div>
          {fields.map((field, index) => <div key={field.key} className="space-y-2">
            <label htmlFor={`tfsa-${field.key}`} className={FIELD_LABEL}>{field.label}</label>
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
              className={FIELD_INPUT} />
            {(field.key === 'annualRate' || field.key === 'years') && <input type="range" aria-label={`${field.label} slider`} min={field.min} max={field.max} step={field.step}
              value={Number.isFinite(values[field.key]) ? Math.min(field.max, Math.max(field.min, values[field.key])) : field.min}
              onChange={event => setInputs(current => ({ ...current, [field.key]: event.target.value }))} className={FIELD_RANGE} />}
            <p id={`tfsa-${field.key}-hint`} className={FIELD_HINT}>{field.hint}</p>
            {errors[index] && <p id={`tfsa-${field.key}-error`} className={FIELD_ERROR}>{errors[index]}</p>}
          </div>)}
        </div>
        <div className="min-w-0 space-y-5" aria-live="polite">
          {result ? <>
            <div className="as-inset space-y-3 p-4">
              <h4 className="text-sm font-bold text-forest-900">Your annual allowance · {result.taxYear.startYear}/{result.taxYear.endYear}</h4>
              <p className="break-words text-xs tabular-nums text-brand-muted-fg">{currency.format(values.currentYearContributions)} used / {currency.format(TFSA_RULES.annualLimit)}</p>
              <AllowanceBar label="Annual contribution allowance used" used={values.currentYearContributions} limit={TFSA_RULES.annualLimit} over={result.annualExcessAlready > 0 || result.annualExcessWithPlan > 0} />
              <p className="break-words text-lg font-bold tabular-nums text-forest-900">{currency.format(result.annualRemaining)} remaining</p>
              {result.annualExcessAlready > 0 && <p className="text-sm text-down">Already over the annual limit by {currency.format(result.annualExcessAlready)}.</p>}
              {result.annualExcessWithPlan > 0 && <p className="text-sm text-down">Your plan would put this tax year {currency.format(result.annualExcessWithPlan)} over the annual limit.</p>}
              {result.firstAnnualBreach && result.firstAnnualBreach.startYear !== result.taxYear.startYear && <p className="text-sm text-down">Your schedule first exceeds the annual limit in {result.firstAnnualBreach.startYear}/{result.firstAnnualBreach.startYear + 1}, by {currency.format(result.firstAnnualBreach.excess)}.</p>}
            </div>
            <div className="as-inset space-y-3 p-4">
              <h4 className="text-sm font-bold text-forest-900">Your lifetime allowance</h4>
              <p className="break-words text-xs tabular-nums text-brand-muted-fg">{currency.format(result.lifetimeUsed)} used / {currency.format(TFSA_RULES.lifetimeLimit)}</p>
              <AllowanceBar label="Lifetime contribution allowance used" used={result.lifetimeUsed} limit={TFSA_RULES.lifetimeLimit} over={result.lifetimeExcessAlready > 0 || result.lifetimeExcessThisTaxYear > 0 || result.lifetimeExcessAtHorizon > 0} />
              <p className="break-words text-lg font-bold tabular-nums text-forest-900">{currency.format(result.lifetimeRemaining)} remaining</p>
              {result.lifetimeExcessAlready > 0 && <p className="text-sm text-down">Already over the lifetime limit by {currency.format(result.lifetimeExcessAlready)}.</p>}
              {result.lifetimeExcessThisTaxYear > 0 && <p className="text-sm text-down">By tax-year end, lifetime contributions would be {currency.format(result.lifetimeExcessThisTaxYear)} over the lifetime limit.</p>}
              {result.lifetimeExcessAtHorizon > 0 && <p className="text-sm text-down">Over {values.years} years, this schedule would exceed lifetime contribution room by {currency.format(result.lifetimeExcessAtHorizon)}. Reduce or stop contributions before exceeding the limit.</p>}
            </div>
            <div className={RESULT_CARD}>
              <p className={RESULT_LABEL}>Illustrative future account value</p>
              <p className="break-words text-3xl font-bold tabular-nums tracking-[-0.02em] text-lime-500">{currency.format(result.projection.projectedValue)}</p>
              <dl className="grid min-w-0 gap-4 border-t border-white/15 pt-4 sm:grid-cols-2">
                <div><dt className={RESULT_LABEL}>Future contributions</dt><dd className="mt-1 break-words text-lg font-bold tabular-nums">{currency.format(result.plannedFutureContributions)}</dd></div>
                <div><dt className={RESULT_LABEL}>Future investment growth</dt><dd className="mt-1 break-words text-lg font-bold tabular-nums">{currency.format(result.projection.investmentGrowth)}</dd></div>
              </dl>
              <p className="text-xs leading-relaxed text-white/80">Uses your entered schedule without capping contributions. Excludes excess-contribution tax; this is not a compliant-plan recommendation. Review any allowance warnings above.</p>
            </div>
          </> : <p className="as-inset p-5 text-sm text-brand-muted-fg">Complete the inputs with valid values to see your allowances and projection.</p>}
        </div>
      </div>
      {result && <PurchasingPower futureValue={result.projection.projectedValue} years={values.years} inflationRate={inflationRate} onInflationChange={onInflationChange} startingCapital={values.currentValue} monthlyContribution={values.monthlyContribution} tfsa scheduleAvailable={values.referenceDate === southAfricanDate(new Date())} />}
      {result && (
        <ToolChart
          title="Account value and future deposits"
          data={result.projection.timeline}
          series={[{ key: 'projectedValue', name: 'Projected account value' }, { key: 'totalContributed', name: 'Starting value + future deposits' }]}
          label={`Illustrative account value after ${values.years} years: ${currency.format(result.projection.projectedValue)}. Future contributions: ${currency.format(result.plannedFutureContributions)}.`}
          caption="The chart starts with your current account value, which may include past growth. Neither line represents lifetime contribution allowance used."
        />
      )}
      <HowWorkedOut>
        <p>Projections are monthly: the selected planning month is treated as a full month, with the planned contribution occurring at month-end. Interest is not prorated by day.</p>
        <p>Contribution limits apply across all your TFSAs, not to market value. Growth can take account value above {currency.format(TFSA_RULES.lifetimeLimit)} without using more contribution room. Unused annual allowance does not carry forward. Withdrawals do not restore room: reinvested money counts as another contribution.</p>
        <p>Current SARS rules impose a {TFSA_RULES.excessContributionTaxRate * 100}% tax on excess contributions. This planner flags excess amounts, but does not calculate your tax liability.</p>
        <p>Rules effective 1 March 2026; future rules may change. Projections assume a constant nominal return, monthly compounding, reinvested growth and month-end deposits. Nominal projections exclude fees, tax and inflation; the separate figure in today’s money uses your inflation assumption. Educational illustration, not personalised tax advice. <a href={TFSA_RULES.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-forest-700 underline underline-offset-4">Read the SARS TFSA guidance</a>.</p>
      </HowWorkedOut>
    </section>
  );
}
