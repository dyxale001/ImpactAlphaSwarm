import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import PurchasingPower from './PurchasingPower';
import Growth from './CompoundInterestCalculator';
import Goal from './InvestmentGoalPlanner';
import TFSA from './TFSAPlanner';
import FinancialToolsPage from '../../pages/FinancialTools';
import { calculateCompoundInterest } from '../../utils/compoundInterest';
import { purchasingPower } from '../../utils/purchasingPower';
const money = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n);
it('uses the growth amount and twenty-year horizon without replacing nominal value', () => {
  const value = calculateCompoundInterest({ initialInvestment: 10000, monthlyContribution: 1000, annualRate: 7, years: 20 }).projectedValue;
  const html = renderToStaticMarkup(createElement(Growth, { inflationRate: '5' }));
  expect(html).toContain(money(value)); expect(html).toContain(money(purchasingPower(value, 5, 20)));
  expect(html).toContain('over 20 years');
});
it('labels the target separately and changes only its purchasing-power figure', () => {
  const five = renderToStaticMarkup(createElement(Goal, { inflationRate: '5' }));
  const zero = renderToStaticMarkup(createElement(Goal, { inflationRate: '0' }));
  expect(five).toContain('Target value at the end of your plan');
  expect(five).toContain('Future target:'); expect(five).toContain(money(purchasingPower(1000000, 5, 20)));
  expect(zero).toContain(money(1000000));
  // This call site deliberately receives targetValue, not the possibly larger projection.
  expect(readFileSync(new URL('./InvestmentGoalPlanner.tsx', import.meta.url), 'utf8')).toContain('targetValue={result.targetValue}');
});
it('adds purchasing power to TFSA account value rather than allowance amounts', () => {
  const html = renderToStaticMarkup(createElement(TFSA, { inflationRate: '5' }));
  expect(html).toContain('in today’s money'); expect(html).toContain('Illustrative future account value');
  expect(readFileSync(new URL('./TFSAPlanner.tsx', import.meta.url), 'utf8')).toContain('futureValue={result.projection.projectedValue} years={values.years}');
});
it('hides computed purchasing power when inflation is invalid', () => {
  const html = renderToStaticMarkup(createElement(PurchasingPower, { futureValue: 1000, years: 20, inflationRate: '' }));
  expect(html).toContain('Enter a valid inflation assumption'); expect(html).not.toContain('Approximately');
});
it('retains both investment modes and TFSA on the dedicated page', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(FinancialToolsPage)));
  for (const text of ['Project Growth', 'Plan a Goal', 'TFSA Planner', 'Assumed annual inflation', 'Based on 5% assumed annual inflation']) expect(html).toContain(text);
});
it('routes tools independently and keeps Learning Centre entry points', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  expect(source('../../App.tsx')).toContain('path="/financial-tools" element={<FinancialToolsPage />}');
  const learning = source('../../pages/Learning.tsx');
  expect(learning).toContain('navigate("/financial-tools")'); expect(learning).toContain('to="/financial-tools"');
  expect(learning).not.toContain('learning-panel-tools');
  expect(source('../layout/AppLayout.tsx')).toContain('name: "Financial Tools", path: "/financial-tools"');
});
it('distinguishes a funded goal target from projected investment gain', () => {
  const html = renderToStaticMarkup(createElement(PurchasingPower, { futureValue: 50000, targetValue: 10000, startingCapital: 20000, monthlyContribution: 0, years: 10, inflationRate: '5' }));
  expect(html).toContain('comparison below uses the projected balance, not the target');
  expect(html).toContain(money(purchasingPower(50000, 5, 10)));
  expect(html).toContain(money(purchasingPower(10000, 5, 10)));
  expect(html).toContain('inflation-adjusted gain');
});
it('reports unavailable TFSA timing rather than showing a comparison', () => {
  const html = renderToStaticMarkup(createElement(PurchasingPower, { futureValue: 50000, years: 10, inflationRate: '5', tfsa: true, scheduleAvailable: false }));
  expect(html).toContain('different planning date'); expect(html).not.toContain('inflation-adjusted gain');
});

it('offers a collapsed accessible inflation editor within purchasing power', () => {
  const html = renderToStaticMarkup(createElement(PurchasingPower, { futureValue: 10000, years: 10, inflationRate: '5', onInflationChange: () => {} }));
  expect(html).toContain('Based on 5% assumed annual inflation');
  expect(html).toContain('Illustrative, not a forecast');
  expect(html).toContain('<details');
  expect(html).not.toContain('<details open');
  expect(html).toContain('>Edit</summary>');
  expect(html).toContain('Assumed annual inflation (%)');
});
it('shows validation within the editor without calculating invalid values', () => {
  const html = renderToStaticMarkup(createElement(PurchasingPower, { futureValue: 10000, years: 10, inflationRate: '-1', onInflationChange: () => {} }));
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('Enter an inflation rate from 0 to 100%');
  expect(html).not.toContain('Projected final value in today');
});
