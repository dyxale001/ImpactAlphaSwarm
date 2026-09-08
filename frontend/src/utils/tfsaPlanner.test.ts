import { describe, expect, it } from 'vitest';
import { calculateTFSAPlan, southAfricanDate, tfsaTaxYear, TFSA_RULES } from './tfsaPlanner';
import { MAX_INVESTMENT_AMOUNT } from './compoundInterest';
const base = { priorLifetimeContributions: 0, currentYearContributions: 0, currentValue: 0, monthlyContribution: 1000, annualRate: 7, years: 20, referenceDate: '2026-09-08' };

describe('TFSA regulatory assumptions and tax-year convention', () => {
  it('keeps the current SARS assumptions together', () => {
    expect(TFSA_RULES).toMatchObject({ annualLimit: 46000, lifetimeLimit: 500000, excessContributionTaxRate: 0.4, effectiveFrom: '2026-03-01' });
  });
  it.each([
    ['2026-03-01', 2026, 12], ['2026-09-08', 2026, 6], ['2027-01-01', 2026, 2],
    ['2027-02-28', 2026, 1], ['2027-03-01', 2027, 12], ['2028-02-29', 2027, 1],
  ])('includes the current calendar month at %s', (date, startYear, months) => {
    expect(tfsaTaxYear(String(date))).toEqual({ startYear, endYear: Number(startYear) + 1, monthsRemaining: months });
  });
  it('uses South African civil dates at a UTC tax-year boundary', () => {
    expect(southAfricanDate(new Date('2027-02-28T21:59:00Z'))).toBe('2027-02-28');
    expect(southAfricanDate(new Date('2027-02-28T22:00:00Z'))).toBe('2027-03-01');
  });
  it.each(['', 'invalid', '2026-02-28', '2027-02-29', '2026-13-01', '2026-04-31'])('rejects unsupported or invalid date %s', date => {
    expect(() => tfsaTaxYear(date)).toThrow(RangeError);
  });
});

describe('TFSA allowance and projection calculations', () => {
  it('starts with full allowance when no contributions have been made', () => {
    expect(calculateTFSAPlan(base)).toMatchObject({ lifetimeUsed: 0, annualRemaining: 46000, lifetimeRemaining: 500000, availableNow: 46000, annualExcessAlready: 0, lifetimeExcessAlready: 0 });
  });
  it('adds prior and current contributions once, separately from current account value', () => {
    expect(calculateTFSAPlan({ ...base, priorLifetimeContributions: 120000, currentYearContributions: 10000, currentValue: 300000 })).toMatchObject({ lifetimeUsed: 130000, annualRemaining: 36000, lifetimeRemaining: 370000 });
  });
  it.each([[46000, 0, 0], [50000, 0, 4000]])('handles annual usage %s', (currentYearContributions, annualRemaining, annualExcessAlready) => {
    expect(calculateTFSAPlan({ ...base, currentYearContributions })).toMatchObject({ annualRemaining, annualExcessAlready });
  });
  it.each([[490000, 10000, 0], [500000, 0, 0], [510000, 0, 10000]])('handles lifetime usage %s', (priorLifetimeContributions, lifetimeRemaining, lifetimeExcessAlready) => {
    expect(calculateTFSAPlan({ ...base, priorLifetimeContributions })).toMatchObject({ lifetimeRemaining, lifetimeExcessAlready });
  });
  it('checks planned deposits against both current limits without clamping them', () => {
    const result = calculateTFSAPlan({ ...base, priorLifetimeContributions: 455000, currentYearContributions: 44000 });
    expect(result).toMatchObject({ plannedThisTaxYear: 6000, annualExcessWithPlan: 4000, lifetimeExcessThisTaxYear: 5000, availableNow: 1000, monthlyWithinCurrentAllowance: 166.66 });
    expect(result.plannedFutureContributions).toBe(240000);
  });
  it('uses full allowance afresh in March without carrying unused room forward', () => {
    const result = calculateTFSAPlan({ ...base, referenceDate: '2027-02-15', monthlyContribution: 4000, years: 2 });
    expect(result.taxYears).toEqual([
      { startYear: 2026, plannedContributions: 4000, totalContributions: 4000, excess: 0 },
      { startYear: 2027, plannedContributions: 48000, totalContributions: 48000, excess: 2000 },
      { startYear: 2028, plannedContributions: 44000, totalContributions: 44000, excess: 0 },
    ]);
    expect(result.firstAnnualBreach?.startYear).toBe(2027);
  });
  it('does not restore lifetime room when account value drops after withdrawal', () => {
    const history = { ...base, priorLifetimeContributions: 500000, monthlyContribution: 100 };
    for (const currentValue of [0, 500000, 900000]) {
      expect(calculateTFSAPlan({ ...history, currentValue })).toMatchObject({ lifetimeRemaining: 0, lifetimeExcessThisTaxYear: 600 });
    }
  });
  it('growth consumes no allowance and may take account value past the lifetime limit', () => {
    const result = calculateTFSAPlan({ ...base, priorLifetimeContributions: 500000, currentValue: 500000, monthlyContribution: 0 });
    expect(result.projection.projectedValue).toBeGreaterThan(500000);
    expect(result.lifetimeUsed).toBe(500000);
    expect(result.lifetimeExcessAtHorizon).toBe(0);
    expect(result.firstAnnualBreach).toBeUndefined();
  });
  it('reconciles current value, new deposits and future growth on the shared timeline', () => {
    const result = calculateTFSAPlan({ ...base, currentValue: 12345 });
    expect(result.projection.timeline[0].projectedValue).toBe(12345);
    expect(result.projection.timeline[result.projection.timeline.length - 1]?.projectedValue).toBe(result.projection.projectedValue);
    expect(12345 + result.plannedFutureContributions + result.projection.investmentGrowth).toBeCloseTo(result.projection.projectedValue, 6);
  });
  it.each(['priorLifetimeContributions', 'currentYearContributions', 'currentValue', 'monthlyContribution', 'annualRate', 'years'] as const)('rejects invalid %s', key => {
    for (const value of [NaN, Infinity, -Infinity, -1]) expect(() => calculateTFSAPlan({ ...base, [key]: value })).toThrow(RangeError);
  });
  it('rejects upper-bound violations and fractional years', () => {
    for (const change of [{ years: 61 }, { years: 1.5 }, { annualRate: 30.1 }, { priorLifetimeContributions: MAX_INVESTMENT_AMOUNT + 1 }]) {
      expect(() => calculateTFSAPlan({ ...base, ...change })).toThrow(RangeError);
    }
  });
  it('keeps maximum-input calculations finite and bounded', () => {
    const result = calculateTFSAPlan({ ...base, priorLifetimeContributions: MAX_INVESTMENT_AMOUNT, currentYearContributions: MAX_INVESTMENT_AMOUNT, currentValue: MAX_INVESTMENT_AMOUNT, monthlyContribution: MAX_INVESTMENT_AMOUNT, annualRate: 30, years: 60 });
    expect(result.projection.timeline).toHaveLength(61);
    expect(Number.isFinite(result.projection.projectedValue)).toBe(true);
    expect(Number.isFinite(result.lifetimeExcessAtHorizon)).toBe(true);
    expect(result.taxYears.length).toBeLessThanOrEqual(61);
  });
});
