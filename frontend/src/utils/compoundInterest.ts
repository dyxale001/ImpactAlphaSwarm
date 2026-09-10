export type CompoundInterestInputs = {
  initialInvestment: number;
  monthlyContribution: number;
  annualRate: number;
  years: number;
};

// Educational input limits also bound arithmetic and chart size.
export const MAX_INVESTMENT_AMOUNT = 9_000_000_000;

export function calculateCompoundInterest(input: CompoundInterestInputs) {
  const { initialInvestment, monthlyContribution, annualRate, years } = input;
  if (
    !Object.values(input).every(Number.isFinite) ||
    !Number.isFinite(initialInvestment) ||
    !Number.isFinite(monthlyContribution) ||
    !Number.isFinite(annualRate) ||
    !Number.isFinite(years) ||
    initialInvestment < 0 ||
    initialInvestment > MAX_INVESTMENT_AMOUNT ||
    monthlyContribution < 0 ||
    monthlyContribution > MAX_INVESTMENT_AMOUNT ||
    annualRate < 0 ||
    annualRate > 30 ||
    !Number.isInteger(years) ||
    years < 1 ||
    years > 60
  ) {
    throw new RangeError(
      "Enter valid amounts, a return from 0–30%, and 1–60 whole years.",
    );
  }
  const monthlyRate = annualRate / 100 / 12;
  let balance = initialInvestment;
  const timeline = [
    { year: 0, projectedValue: balance, totalContributed: initialInvestment },
  ];
  for (let month = 1; month <= years * 12; month++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (month % 12 === 0) {
      timeline.push({
        year: month / 12,
        projectedValue: balance,
        totalContributed: initialInvestment + month * monthlyContribution,
      });
    }
  }
  const totalContributed = initialInvestment + years * 12 * monthlyContribution;
  // Preserve the exact zero-rate identity despite repeated floating-point additions.
  const projectedValue = annualRate === 0 ? totalContributed : balance;
  if (annualRate === 0)
    timeline.forEach((point) => {
      point.projectedValue = point.totalContributed;
    });
  const investmentGrowth = projectedValue - totalContributed;
  return {
    projectedValue,
    totalContributed,
    investmentGrowth,
    timeline,
    growthPercentage:
      projectedValue > 0 ? (investmentGrowth / projectedValue) * 100 : 0,
  };
}
