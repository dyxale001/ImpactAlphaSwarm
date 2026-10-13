export const DEFAULT_INFLATION_RATE = '5';
// Educational bounds, not a forecast or an investment-return assumption.
export function validateInflation(input: string): string | null {
  if (!input.trim()) return 'Enter an assumed inflation rate.';
  const rate = Number(input);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return 'Enter an inflation rate from 0 to 100%.';
  return null;
}
export function purchasingPower(futureValue: number, inflationRate: number, years: number): number {
  if (![futureValue, inflationRate, years].every(Number.isFinite) || futureValue < 0 || inflationRate < 0 || inflationRate > 100 || years < 0 || years > 60) {
    throw new RangeError('Enter valid purchasing-power assumptions.');
  }
  return futureValue / (1 + inflationRate / 100) ** years;
}

/** Match the existing planners: initial capital now, equal deposits at month end. */
export function purchasingPowerComparison(futureValue: number, startingCapital: number, monthlyContribution: number, inflationRate: number, years: number) {
  const finalValue = purchasingPower(futureValue, inflationRate, years);
  if (![startingCapital, monthlyContribution].every(Number.isFinite) || startingCapital < 0 || monthlyContribution < 0 || !Number.isInteger(years)) throw new RangeError('Enter a valid contribution schedule.');
  let contributions = startingCapital;
  for (let month = 1; month <= years * 12; month++) {
    contributions += purchasingPower(monthlyContribution, inflationRate, month / 12);
  }
  if (inflationRate === 0) contributions = startingCapital + monthlyContribution * years * 12;
  return { finalValue, contributions, gain: finalValue - contributions };
}
