import { calculateCompoundInterest, MAX_INVESTMENT_AMOUNT } from './compoundInterest';

// Time-sensitive SARS assumptions effective 1 March 2026. Review when tax rules change.
// Future projections hold these limits constant; this is not a historical tax calculator.
export const TFSA_RULES = {
  effectiveFrom: '2026-03-01',
  annualLimit: 46_000,
  lifetimeLimit: 500_000,
  excessContributionTaxRate: 0.4,
  sourceUrl: 'https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/',
} as const;

/** Civil South African date, independent of the browser's timezone. */
export function southAfricanDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** March–February tax year. Include the reference month's planned month-end contribution. */
export function tfsaTaxYear(referenceDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new RangeError('Enter a valid planning date.');
  const date = new Date(`${referenceDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== referenceDate) throw new RangeError('Enter a valid planning date.');
  if (referenceDate < TFSA_RULES.effectiveFrom) throw new RangeError('These rules apply from 1 March 2026.');
  const month = date.getUTCMonth() + 1;
  const startYear = date.getUTCFullYear() - (month < 3 ? 1 : 0);
  return { startYear, endYear: startYear + 1, monthsRemaining: month >= 3 ? 15 - month : 3 - month };
}

export type TFSAPlannerInputs = {
  priorLifetimeContributions: number;
  currentYearContributions: number;
  currentValue: number;
  monthlyContribution: number;
  annualRate: number;
  years: number;
  referenceDate: string;
};

export function calculateTFSAPlan(input: TFSAPlannerInputs) {
  const taxYear = tfsaTaxYear(input.referenceDate);
  for (const amount of [input.priorLifetimeContributions, input.currentYearContributions]) {
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_INVESTMENT_AMOUNT) throw new RangeError('Contribution history must be a non-negative amount within the input limit.');
  }
  const projection = calculateCompoundInterest({ initialInvestment: input.currentValue, monthlyContribution: input.monthlyContribution, annualRate: input.annualRate, years: input.years });
  const lifetimeUsed = input.priorLifetimeContributions + input.currentYearContributions;
  const annualRemaining = Math.max(0, TFSA_RULES.annualLimit - input.currentYearContributions);
  const lifetimeRemaining = Math.max(0, TFSA_RULES.lifetimeLimit - lifetimeUsed);
  const availableNow = Math.min(annualRemaining, lifetimeRemaining);
  const plannedThisTaxYear = input.monthlyContribution * taxYear.monthsRemaining;
  const plannedFutureContributions = input.monthlyContribution * input.years * 12;
  // Each tax year starts afresh; no unused annual allowance is carried forward.
  const taxYears: { startYear: number; plannedContributions: number; totalContributions: number; excess: number }[] = [];
  let remainingMonths = input.years * 12;
  let startYear = taxYear.startYear;
  while (remainingMonths > 0) {
    const first = startYear === taxYear.startYear;
    const months = Math.min(remainingMonths, first ? taxYear.monthsRemaining : 12);
    const plannedContributions = months * input.monthlyContribution;
    const totalContributions = plannedContributions + (first ? input.currentYearContributions : 0);
    taxYears.push({ startYear, plannedContributions, totalContributions, excess: Math.max(0, totalContributions - TFSA_RULES.annualLimit) });
    remainingMonths -= months;
    startYear++;
  }
  return {
    taxYear, lifetimeUsed, annualRemaining, lifetimeRemaining, availableNow,
    // Round down to cents so the displayed monthly amount cannot exceed the room.
    monthlyWithinCurrentAllowance: Math.floor(availableNow / taxYear.monthsRemaining * 100) / 100,
    annualExcessAlready: Math.max(0, input.currentYearContributions - TFSA_RULES.annualLimit),
    lifetimeExcessAlready: Math.max(0, lifetimeUsed - TFSA_RULES.lifetimeLimit),
    plannedThisTaxYear,
    annualExcessWithPlan: taxYears[0].excess,
    lifetimeExcessThisTaxYear: Math.max(0, lifetimeUsed + plannedThisTaxYear - TFSA_RULES.lifetimeLimit),
    plannedFutureContributions,
    lifetimeExcessAtHorizon: Math.max(0, lifetimeUsed + plannedFutureContributions - TFSA_RULES.lifetimeLimit),
    firstAnnualBreach: taxYears.find(year => year.excess > 0),
    taxYears,
    projection,
  };
}
