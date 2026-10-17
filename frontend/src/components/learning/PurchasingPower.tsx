import { useId } from 'react';
import { purchasingPower, purchasingPowerComparison, validateInflation } from '../../utils/purchasingPower';
const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
export default function PurchasingPower({ futureValue, years, inflationRate, onInflationChange, startingCapital = 0, monthlyContribution = 0, targetValue, tfsa = false, scheduleAvailable = true }: {
  futureValue: number; years: number; inflationRate: string; onInflationChange?: (value: string) => void; startingCapital?: number; monthlyContribution?: number; targetValue?: number; tfsa?: boolean; scheduleAvailable?: boolean;
}) {
  const inputId = useId();
  const inflationError = validateInflation(inflationRate);
  return (
    <details aria-label="Understanding inflation" className="as-inset space-y-3 p-4 text-sm text-forest-900">
      <summary className="cursor-pointer rounded-sm font-bold text-forest-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Understanding inflation</summary>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-brand-muted-fg">
        <p>{inflationError ? 'Set an assumed annual inflation rate.' : `Based on ${Number(inflationRate)}% assumed annual inflation.`} Illustrative, not a forecast.</p>
        {onInflationChange && <details className="min-w-0">
          <summary className="cursor-pointer py-2 font-bold text-forest-700 underline underline-offset-4">Edit</summary>
          <div className="space-y-2 pb-2">
            <label htmlFor={inputId} className="block">Assumed annual inflation (%)</label>
            <input id={inputId} type="number" min={0} max={100} step="0.1" value={inflationRate} onChange={event => onInflationChange(event.target.value)} aria-invalid={Boolean(inflationError)} aria-describedby={`${inputId}-error`} className="h-11 w-32 rounded-[12px] border border-forest-900/15 bg-white px-3 text-sm tabular-nums text-forest-900 focus:border-forest-700 focus:outline-none" />
            <p id={`${inputId}-error`} className="text-down">{inflationError}</p>
          </div>
        </details>}
      </div>
      {validateInflation(inflationRate) ? <p className="text-xs text-brand-muted-fg">Enter a valid inflation assumption to see purchasing power.</p> : !scheduleAvailable ? <p className="text-xs text-brand-muted-fg">This TFSA plan uses a different planning date. A comparison in today’s money requires a plan starting today; historical deposit dates are not available.</p> : (() => {
        const rate = Number(inflationRate);
        const comparison = purchasingPowerComparison(futureValue, startingCapital, monthlyContribution, rate, years);
        return <>
          {targetValue !== undefined && <p className="text-xs text-brand-muted-fg">Future target: {currency.format(targetValue)}. Target equivalent: approximately {currency.format(purchasingPower(targetValue, rate, years))} in today’s money. The comparison below uses the projected balance, not the target.</p>}
          <dl className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-[12px] bg-white p-3"><dt className="text-xs text-brand-muted-fg">Projected final value in today’s money</dt><dd className="mt-1 text-base font-bold tabular-nums">{currency.format(comparison.finalValue)}</dd></div>
            <div className="rounded-[12px] bg-white p-3"><dt className="text-xs text-brand-muted-fg">{tfsa ? 'Starting account value + future deposits in today’s money' : 'Starting capital + contributions in today’s money'}</dt><dd className="mt-1 text-base font-bold tabular-nums">{currency.format(comparison.contributions)}</dd></div>
            <div className="rounded-[12px] bg-white p-3"><dt className="text-xs text-brand-muted-fg">Illustrative inflation-adjusted {comparison.gain < 0 ? 'loss' : 'gain'}{tfsa ? ' from this plan' : ''}</dt><dd className={`mt-1 text-base font-bold tabular-nums ${comparison.gain < 0 ? 'text-down' : 'text-up'}`}>{currency.format(Math.abs(comparison.gain))}</dd></div>
          </dl>
          <p className="text-xs text-brand-muted-fg">Assuming {rate}% annual inflation over {years} {years === 1 ? 'year' : 'years'}. Starting capital is valued today; each planned month-end deposit is discounted separately using its timing in the projection. Illustrative, not a forecast.</p>
          {tfsa && <p className="text-xs text-brand-muted-fg">The starting account value may include past growth. This is a comparison from today onward, not a lifetime contribution or profit calculation. Historical deposit timing is unavailable. The entered schedule is not capped at contribution limits.</p>}
        </>;
      })()}
      <p className="text-xs leading-relaxed text-brand-muted-fg">Inflation affects the purchasing power of both invested money and cash. These figures use the same today’s-money basis and illustrate purchasing power, not a guaranteed investment outcome. Investing does not always beat inflation.</p>
    </details>
  );
}
