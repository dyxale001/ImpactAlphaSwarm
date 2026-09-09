import { calculateCompoundInterest, MAX_INVESTMENT_AMOUNT } from './compoundInterest';

export type InvestmentGoalInputs = {
  targetValue: number;
  currentInvestment: number;
  annualRate: number;
  years: number;
};

export function calculateInvestmentGoal({ targetValue, currentInvestment, annualRate, years }: InvestmentGoalInputs) {
  if (!Number.isFinite(targetValue) || targetValue <= 0 || targetValue > MAX_INVESTMENT_AMOUNT) {
    throw new RangeError(`Target must be greater than zero and at most ${MAX_INVESTMENT_AMOUNT}.`);
  }
  // Reuse both the existing bounds and the exact current-investment projection.
  const currentProjection = calculateCompoundInterest({ initialInvestment: currentInvestment, monthlyContribution: 0, annualRate, years });
  const months = years * 12;
  const monthlyRate = annualRate / 100 / 12;
  const futureShortfall = Math.max(0, targetValue - currentProjection.projectedValue);
  // Ordinary annuity: contributions at month end. log1p/expm1 avoid cancellation at tiny rates.
  const annuityFactor = monthlyRate === 0 ? months : Math.expm1(months * Math.log1p(monthlyRate)) / monthlyRate;
  const monthlyContribution = futureShortfall / annuityFactor;
  const projection = calculateCompoundInterest({ initialInvestment: currentInvestment, monthlyContribution, annualRate, years });
  return {
    targetValue,
    monthlyContribution,
    currentInvestmentFutureValue: currentProjection.projectedValue,
    futureContributions: monthlyContribution * months,
    achievableWithoutContributions: futureShortfall === 0,
    ...projection,
  };
}
