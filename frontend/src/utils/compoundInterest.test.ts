import { describe, expect, it } from 'vitest';
import { calculateCompoundInterest, MAX_INVESTMENT_AMOUNT } from './compoundInterest';
const defaults = { initialInvestment: 1000, monthlyContribution: 100, annualRate: 12, years: 1 };

describe('compound interest', () => {
  it('compounds a lump sum monthly without contributions', () => {
    const result = calculateCompoundInterest({ ...defaults, monthlyContribution: 0 });
    expect(result.projectedValue).toBeCloseTo(1000 * 1.01 ** 12, 8);
    expect(result.totalContributed).toBe(1000);
  });
  it('applies contributions at month end, including zero starting investment', () => {
    const result = calculateCompoundInterest({ ...defaults, initialInvestment: 0 });
    // First contribution earns eleven months of returns; last earns none.
    const expected = Array.from({ length: 12 }, (_, months) => 100 * 1.01 ** months).reduce((a, b) => a + b, 0);
    expect(result.projectedValue).toBeCloseTo(expected, 8);
    expect(result.totalContributed).toBe(1200);
  });
  it('combines lump sum and contributions', () => {
    expect(calculateCompoundInterest(defaults).projectedValue).toBeCloseTo(1000 * 1.01 ** 12 + 100 * (1.01 ** 12 - 1) / 0.01, 8);
  });
  it('handles decimal annual return', () => {
    expect(calculateCompoundInterest({ ...defaults, annualRate: 7.25, monthlyContribution: 0 }).projectedValue).toBeCloseTo(1000 * (1 + 0.0725 / 12) ** 12, 8);
  });
  it('preserves the zero-return identity even for decimal contributions', () => {
    const result = calculateCompoundInterest({ ...defaults, initialInvestment: 0.1, monthlyContribution: 0.1, annualRate: 0 });
    expect(result.projectedValue).toBe(result.totalContributed);
    expect(result.investmentGrowth).toBe(0);
    result.timeline.forEach(point => expect(point.projectedValue).toBe(point.totalContributed));
  });
  it('handles an entirely zero investment without an undefined growth percentage', () => {
    expect(calculateCompoundInterest({ ...defaults, initialInvestment: 0, monthlyContribution: 0 })).toMatchObject({ projectedValue: 0, totalContributed: 0, investmentGrowth: 0, growthPercentage: 0 });
  });
  it('includes year zero and every year, using the same final totals', () => {
    const result = calculateCompoundInterest({ ...defaults, years: 5 });
    expect(result.timeline.map(p => p.year)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.timeline[0]).toEqual({ year: 0, projectedValue: 1000, totalContributed: 1000 });
    expect(result.timeline[5].projectedValue).toBe(result.projectedValue);
    expect(result.timeline[5].totalContributed).toBe(result.totalContributed);
    expect(result.totalContributed + result.investmentGrowth).toBeCloseTo(result.projectedValue, 8);
  });
  it.each(['initialInvestment', 'monthlyContribution', 'annualRate', 'years'] as const)('rejects non-finite %s', field => {
    for (const value of [NaN, Infinity, -Infinity]) expect(() => calculateCompoundInterest({ ...defaults, [field]: value })).toThrow(RangeError);
  });
  it.each([
    { initialInvestment: -1 }, { monthlyContribution: -1 }, { annualRate: -0.1 }, { annualRate: 30.1 },
    { years: 0 }, { years: 61 }, { years: 1.5 }, { initialInvestment: MAX_INVESTMENT_AMOUNT + 1 }, { monthlyContribution: MAX_INVESTMENT_AMOUNT + 1 },
  ])('rejects out-of-bounds input %o', change => {
    expect(() => calculateCompoundInterest({ ...defaults, ...change })).toThrow(RangeError);
  });
  it('keeps all outputs finite at maximum allowed inputs and bounds the timeline', () => {
    const result = calculateCompoundInterest({ initialInvestment: MAX_INVESTMENT_AMOUNT, monthlyContribution: MAX_INVESTMENT_AMOUNT, annualRate: 30, years: 60 });
    expect(result.timeline).toHaveLength(61);
    expect([result.projectedValue, result.totalContributed, result.investmentGrowth, result.growthPercentage].every(Number.isFinite)).toBe(true);
    result.timeline.forEach(point => expect(Object.values(point).every(Number.isFinite)).toBe(true));
  });
});
