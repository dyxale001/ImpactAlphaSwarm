import { describe, expect, it } from 'vitest';
import { calculateInvestmentGoal } from './investmentGoal';
import { MAX_INVESTMENT_AMOUNT } from './compoundInterest';
const base = { targetValue: 100000, currentInvestment: 10000, annualRate: 7, years: 10 };

describe('investment goal planner', () => {
  it('solves zero-return contributions from the remaining target', () => {
    const result = calculateInvestmentGoal({ ...base, annualRate: 0 });
    expect(result.monthlyContribution).toBe(750);
    expect(result.projectedValue).toBe(100000);
    expect(result.investmentGrowth).toBe(0);
  });
  it('solves the ordinary annuity with zero current capital and month-end payments', () => {
    const result = calculateInvestmentGoal({ targetValue: 12000, currentInvestment: 0, annualRate: 12, years: 1 });
    // First deposit grows eleven months; the final deposit earns no interest.
    const depositWeights = Array.from({ length: 12 }, (_, n) => 1.01 ** n).reduce((a, b) => a + b, 0);
    expect(result.monthlyContribution).toBeCloseTo(12000 / depositWeights, 8);
    expect(result.projectedValue).toBeCloseTo(12000, 8);
  });
  it('subtracts the future value of existing capital before solving contributions', () => {
    const result = calculateInvestmentGoal({ targetValue: 12000, currentInvestment: 1000, annualRate: 12, years: 1 });
    expect(result.monthlyContribution).toBeCloseTo((12000 - 1000 * 1.01 ** 12) / ((1.01 ** 12 - 1) / 0.01), 8);
  });
  it.each([7.25, 0.000000001])('handles decimal annual return %s without unstable subtraction', annualRate => {
    const result = calculateInvestmentGoal({ ...base, annualRate });
    expect(result.monthlyContribution).toBeGreaterThan(0);
    expect(result.projectedValue).toBeCloseTo(base.targetValue, 5);
  });
  it.each([
    { targetValue: 10000, currentInvestment: 10000, annualRate: 0 },
    { targetValue: 10000, currentInvestment: 20000, annualRate: 0 },
    { targetValue: 10000, currentInvestment: 9000, annualRate: 30 },
  ])('requires zero when current capital already funds the target: %o', change => {
    const result = calculateInvestmentGoal({ ...base, ...change });
    expect(result.monthlyContribution).toBe(0);
    expect(result.achievableWithoutContributions).toBe(true);
    expect(result.projectedValue).toBeGreaterThanOrEqual(change.targetValue);
  });
  it.each([1, 60])('handles a very small target over %s years', years => {
    const result = calculateInvestmentGoal({ ...base, targetValue: 0.01, currentInvestment: 0, years });
    expect(result.monthlyContribution).toBeGreaterThan(0);
    expect(result.projectedValue).toBeCloseTo(0.01, 10);
  });
  it('keeps headline, yearly chart and contribution/growth accounting consistent', () => {
    const result = calculateInvestmentGoal(base);
    expect(result.timeline[0]).toMatchObject({ year: 0, projectedValue: base.currentInvestment });
    expect(result.timeline).toHaveLength(base.years + 1);
    expect(result.timeline[result.timeline.length - 1]?.projectedValue).toBe(result.projectedValue);
    expect(result.projectedValue).toBeCloseTo(base.targetValue, 6);
    expect(base.currentInvestment + result.futureContributions + result.investmentGrowth).toBeCloseTo(result.projectedValue, 6);
  });
  it('reduces required contributions as time or starting capital increases', () => {
    const original = calculateInvestmentGoal(base).monthlyContribution;
    expect(calculateInvestmentGoal({ ...base, years: 20 }).monthlyContribution).toBeLessThan(original);
    expect(calculateInvestmentGoal({ ...base, currentInvestment: 20000 }).monthlyContribution).toBeLessThan(original);
  });
  it.each(['targetValue', 'currentInvestment', 'annualRate', 'years'] as const)('rejects invalid %s', key => {
    for (const value of [NaN, Infinity, -Infinity, -1]) expect(() => calculateInvestmentGoal({ ...base, [key]: value })).toThrow(RangeError);
  });
  it('rejects zero target, invalid periods and exceeded bounds', () => {
    for (const change of [{ targetValue: 0 }, { targetValue: MAX_INVESTMENT_AMOUNT + 1 }, { years: 0 }, { years: 61 }, { years: 1.5 }, { annualRate: 31 }]) expect(() => calculateInvestmentGoal({ ...base, ...change })).toThrow(RangeError);
  });
  it.each([1, 60])('keeps maximum valid targets finite over %s years', years => {
    const result = calculateInvestmentGoal({ targetValue: MAX_INVESTMENT_AMOUNT, currentInvestment: 0, annualRate: 30, years });
    expect(Number.isFinite(result.monthlyContribution)).toBe(true);
    expect(Number.isFinite(result.projectedValue)).toBe(true);
    expect(result.projectedValue / MAX_INVESTMENT_AMOUNT).toBeCloseTo(1, 10);
  });
});
