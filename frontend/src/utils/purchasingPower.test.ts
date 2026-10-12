import { expect, it } from 'vitest';
import { purchasingPower, validateInflation } from './purchasingPower';
import { calculateCompoundInterest } from './compoundInterest';
import { calculateInvestmentGoal } from './investmentGoal';
import { calculateTFSAPlan } from './tfsaPlanner';
it('discounts R10 million over thirty years at 5%', () => expect(purchasingPower(10_000_000, 5, 30)).toBeCloseTo(2_313_774.4866, 3));
it('preserves zero inflation, zero amounts and year zero', () => {
  expect(purchasingPower(1234.56, 0, 30)).toBe(1234.56);
  expect(purchasingPower(0, 5, 30)).toBe(0);
  expect(purchasingPower(1234, 5, 0)).toBe(1234);
});
it.each(['', ' ', '-1', 'NaN', 'Infinity', 'abc', '101'])('rejects invalid inflation %j', input => expect(validateInflation(input)).not.toBeNull());
it.each(['0', '5', '2.75', '100'])('accepts valid inflation %s', input => expect(validateInflation(input)).toBeNull());
it('rejects invalid numerical arguments', () => {
  for (const args of [[NaN,5,30],[100,Infinity,30],[100,-1,30],[100,5,-1],[100,5,61],[-1,5,30]]) expect(() => purchasingPower(...args as [number, number, number])).toThrow(RangeError);
});
it('higher inflation and longer horizons reduce purchasing power', () => {
  expect(purchasingPower(10000, 5, 30)).toBeLessThan(purchasingPower(10000, 5, 10));
  expect(purchasingPower(10000, 10, 30)).toBeLessThan(purchasingPower(10000, 5, 30));
});
it('does not change nominal projections, goal contributions or TFSA limits', () => {
  const growth = calculateCompoundInterest({ initialInvestment: 10000, monthlyContribution: 1000, annualRate: 7, years: 20 });
  const goal = calculateInvestmentGoal({ targetValue: 10000, currentInvestment: 20000, annualRate: 7, years: 20 });
  const tfsa = calculateTFSAPlan({ priorLifetimeContributions: 0, currentYearContributions: 0, currentValue: 10000, monthlyContribution: 1000, annualRate: 7, years: 20, referenceDate: '2026-10-12' });
  const before = JSON.stringify({ growth, goal, tfsa });
  for (const rate of [0, 5, 10]) {
    purchasingPower(growth.projectedValue, rate, 20);
    purchasingPower(goal.targetValue, rate, 20);
    purchasingPower(tfsa.projection.projectedValue, rate, 20);
  }
  expect(JSON.stringify({ growth, goal, tfsa })).toBe(before);
  expect(goal.monthlyContribution).toBe(0);
  expect(goal.projectedValue).toBeGreaterThan(goal.targetValue);
});

import { purchasingPowerComparison } from './purchasingPower';
it('keeps the initial lump sum at its present value', () => {
  const result = purchasingPowerComparison(2000, 1000, 0, 5, 10);
  expect(result.contributions).toBe(1000);
  expect(result.finalValue).toBe(purchasingPower(2000, 5, 10));
});
it('discounts equal monthly deposits at their individual month ends', () => {
  const expected = 1000 + Array.from({ length: 12 }, (_, i) => 100 / 1.05 ** ((i + 1) / 12)).reduce((a,b) => a+b, 0);
  expect(purchasingPowerComparison(2500, 1000, 100, 5, 1).contributions).toBeCloseTo(expected, 10);
});
it('zero inflation matches nominal contribution accounting', () => {
  expect(purchasingPowerComparison(2500, 1000, 100, 0, 1)).toEqual({ finalValue: 2500, contributions: 2200, gain: 300 });
});
it.each([0, 10])('shows loss or gain from a %s nominal return under 5% inflation', annualRate => {
  const projection = calculateCompoundInterest({ initialInvestment: 10000, monthlyContribution: 100, annualRate, years: 10 });
  const comparison = purchasingPowerComparison(projection.projectedValue, 10000, 100, 5, 10);
  expect(annualRate === 0 ? comparison.gain < 0 : comparison.gain > 0).toBe(true);
});
it('uses the TFSA month-end schedule without altering allowance calculations', () => {
  const plan = calculateTFSAPlan({ priorLifetimeContributions: 5000, currentYearContributions: 1000, currentValue: 8000, monthlyContribution: 1000, annualRate: 7, years: 1, referenceDate: '2026-10-12' });
  const before = JSON.stringify(plan);
  const comparison = purchasingPowerComparison(plan.projection.projectedValue, 8000, 1000, 5, 1);
  expect(comparison.contributions).toBeCloseTo(8000 + Array.from({ length: 12 }, (_, i) => purchasingPower(1000, 5, (i+1)/12)).reduce((a,b) => a+b, 0), 8);
  expect(JSON.stringify(plan)).toBe(before);
});
it('compares actual goal projection, not a smaller target, when already funded', () => {
  const goal = calculateInvestmentGoal({ targetValue: 10000, currentInvestment: 20000, annualRate: 10, years: 10 });
  const comparison = purchasingPowerComparison(goal.projectedValue, 20000, goal.monthlyContribution, 5, 10);
  expect(goal.monthlyContribution).toBe(0); expect(comparison.gain).toBeGreaterThan(0);
  expect(purchasingPower(goal.targetValue, 5, 10)).toBeLessThan(comparison.contributions);
});
