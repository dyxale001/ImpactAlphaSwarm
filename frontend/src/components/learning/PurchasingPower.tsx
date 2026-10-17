import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { purchasingPower, purchasingPowerComparison, validateInflation } from '../../utils/purchasingPower';
const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

/**
 * "In today's money": the answer read a second way, as a dropdown under the result
 * card. Closed, its row still carries the headline figure, so the one number most
 * people want is never hidden; open, it shows the breakdown, the inflation rate to
 * edit and the footnote. The longer explanation is in the calculator's "How is this
 * worked out?" window (InflationNotes below).
 */
export default function PurchasingPower({ futureValue, years, inflationRate, onInflationChange, startingCapital = 0, monthlyContribution = 0, targetValue, tfsa = false, scheduleAvailable = true }: {
  futureValue: number; years: number; inflationRate: string; onInflationChange?: (value: string) => void; startingCapital?: number; monthlyContribution?: number; targetValue?: number; tfsa?: boolean; scheduleAvailable?: boolean;
}) {
  const inputId = useId();
  const inflationError = validateInflation(inflationRate);
  const rate = Number(inflationRate);
  const comparison = !inflationError && scheduleAvailable
    ? purchasingPowerComparison(futureValue, startingCapital, monthlyContribution, rate, years)
    : null;

  return (
    <details aria-label="In today’s money" className="group as-inset text-sm text-forest-900">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-[16px] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block whitespace-nowrap font-bold">In today’s money</span>
          <span className="block text-xs text-brand-muted-fg">{inflationError ? 'Set an inflation rate' : `At ${rate}% inflation a year`}</span>
        </span>
        {comparison && <span className="shrink-0 text-base font-bold tabular-nums sm:text-lg">≈ {currency.format(comparison.finalValue)}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-forest-700 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="space-y-3 border-t border-forest-900/8 px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-brand-muted-fg">
          <p>{inflationError ? 'Set an assumed annual inflation rate.' : `Based on ${rate}% assumed annual inflation.`}</p>
          {onInflationChange && <details className="min-w-0">
            <summary className="cursor-pointer font-bold text-forest-700 underline underline-offset-4">Edit</summary>
            <div className="space-y-2 pt-2">
              <label htmlFor={inputId} className="block">Assumed annual inflation (%)</label>
              <input id={inputId} type="number" min={0} max={100} step="0.1" value={inflationRate} onChange={event => onInflationChange(event.target.value)} aria-invalid={Boolean(inflationError)} aria-describedby={`${inputId}-error`} className="h-10 w-28 rounded-[12px] border border-forest-900/15 bg-white px-3 text-sm tabular-nums text-forest-900 focus:border-forest-700 focus:outline-none" />
              <p id={`${inputId}-error`} className="text-down">{inflationError}</p>
            </div>
          </details>}
        </div>

        {inflationError ? <p className="text-xs text-brand-muted-fg">Enter a valid inflation assumption to see purchasing power.</p> : !scheduleAvailable ? <p className="text-xs text-brand-muted-fg">This TFSA plan uses a different planning date. A comparison in today’s money requires a plan starting today; historical deposit dates are not available.</p> : comparison && <>
          {targetValue !== undefined && <p className="text-xs text-brand-muted-fg">Future target: {currency.format(targetValue)}. Target equivalent: approximately {currency.format(purchasingPower(targetValue, rate, years))} in today’s money. The comparison below uses the projected balance, not the target.</p>}
          {/* The breakdown as rows on a white panel: label left, figure right. */}
          <dl className="divide-y divide-forest-900/8 rounded-[12px] bg-white px-3">
            <div className="flex items-baseline justify-between gap-3 py-2.5"><dt className="text-xs text-brand-muted-fg">Projected final value in today’s money</dt><dd className="shrink-0 font-bold tabular-nums">{currency.format(comparison.finalValue)}</dd></div>
            <div className="flex items-baseline justify-between gap-3 py-2.5"><dt className="text-xs text-brand-muted-fg">{tfsa ? 'Starting account value + future deposits in today’s money' : 'Starting capital + contributions in today’s money'}</dt><dd className="shrink-0 font-bold tabular-nums">{currency.format(comparison.contributions)}</dd></div>
            <div className="flex items-baseline justify-between gap-3 py-2.5"><dt className="text-xs text-brand-muted-fg">Illustrative inflation-adjusted {comparison.gain < 0 ? 'loss' : 'gain'}{tfsa ? ' from this plan' : ''}</dt><dd className={`shrink-0 font-bold tabular-nums ${comparison.gain < 0 ? 'text-down' : 'text-up'}`}>{comparison.gain < 0 ? '−' : '+'}{currency.format(Math.abs(comparison.gain))}</dd></div>
          </dl>
          <p className="text-xs text-brand-muted-fg">Assuming {rate}% annual inflation over {years} {years === 1 ? 'year' : 'years'}. Illustrative, not a forecast.</p>
        </>}
      </div>
    </details>
  );
}

/** The longer inflation explanation, for the "How is this worked out?" window. */
export function InflationNotes({ tfsa = false }: { tfsa?: boolean }) {
  return <>
    <p>Starting capital is valued today; each planned month-end deposit is discounted separately using its timing in the projection.</p>
    {tfsa && <p>The starting account value may include past growth. This is a comparison from today onward, not a lifetime contribution or profit calculation. Historical deposit timing is unavailable. The entered schedule is not capped at contribution limits.</p>}
    <p>Inflation affects the purchasing power of both invested money and cash. These figures use the same today’s-money basis and illustrate purchasing power, not a guaranteed investment outcome. Investing does not always beat inflation.</p>
  </>;
}
