// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import AboutThisPage from './AboutThisPage';
import { PAGE_EXPLANATIONS, type ExplanationPage } from './pageExplanations';
let container: HTMLDivElement, root: Root, main: HTMLElement;
const showModal = vi.fn(function(this: HTMLDialogElement) { this.setAttribute('open', ''); });
const close = vi.fn(function(this: HTMLDialogElement) { this.removeAttribute('open'); });
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lacks the native top layer/inert behaviour; assert use of showModal,
  // and verify actual background blocking in the browser acceptance pass.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });
  vi.clearAllMocks();
  main = document.createElement('main'); main.scrollTop = 420; main.style.overflow = 'auto';
  container = document.createElement('div'); main.append(container); document.body.append(main); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); main.remove(); });
async function mount(page: ExplanationPage = 'stocks', rankingMode?: 'legacy' | 'scorecard') {
  await act(async () => root.render(createElement(MemoryRouter, {}, createElement(AboutThisPage, { page, rankingMode, methodologyHref: '/asset/AAPL/how-it-works' }))));
  return container.querySelector('button')!;
}
async function open(page: ExplanationPage = 'stocks', rankingMode?: 'legacy' | 'scorecard') {
  const trigger = await mount(page, rankingMode); trigger.focus();
  await act(async () => trigger.click()); return trigger;
}
function dialog() { return document.querySelector('dialog')!; }
it('starts closed with one outline pill trigger and opens a named native modal', async () => {
  const trigger = await mount();
  expect(document.querySelector('dialog')).toBeNull(); expect(trigger.textContent).toBe('About this page');
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog'); expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(trigger.className).toContain('as-btn-ghost-dark'); expect(trigger.className).toContain('focus-visible:outline');
  trigger.focus(); await act(async () => trigger.click());
  expect(showModal).toHaveBeenCalledOnce(); expect(dialog().open).toBe(true);
  expect(document.getElementById(dialog().getAttribute('aria-labelledby')!)?.textContent).toBe(PAGE_EXPLANATIONS.stocks.title);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('dialog')).toBeNull(); // portal escapes transformed heroes
  expect(document.querySelector('details')).toBeNull();
});
it.each(['Escape', 'Close', 'Got it', 'cancel', 'backdrop'])('closes via %s, restores focus and main scrolling', async method => {
  const before = document.body.style.overflow;
  const trigger = await open(); expect(main.style.overflow).toBe('hidden'); expect(main.scrollTop).toBe(420);
  await act(async () => {
    if (method === 'Escape') dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (method === 'cancel') dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    else if (method === 'backdrop') dialog().click();
    else [...dialog().querySelectorAll('button')].find(button => button.getAttribute('aria-label') === method || button.textContent === method)!.click();
  });
  expect(document.querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
  expect(main.style.overflow).toBe('auto'); expect(main.scrollTop).toBe(420); expect(document.body.style.overflow).toBe(before);
});
it('wraps Tab and Shift+Tab within the modal and supports an internal methodology link', async () => {
  await open(); const first = dialog().querySelector('button')!;
  const last = [...dialog().querySelectorAll('button')].at(-1)!;
  first.focus(); await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(last);
  await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(first);
  const link = dialog().querySelector('a')!; expect(link.getAttribute('href')).toBe('/asset/AAPL/how-it-works');
});
it('restores scroll locks when unmounted while open', async () => {
  const before = document.body.style.overflow; await open();
  await act(async () => root.render(null));
  expect(main.style.overflow).toBe('auto'); expect(document.body.style.overflow).toBe(before);
});
it('uses a forest header, readable panels, mobile scrolling and no animation', async () => {
  await open();
  expect(dialog().querySelector('header')?.className).toContain('hero-card');
  expect(dialog().className).toContain('90dvh');
  expect(dialog().querySelector('.overflow-y-auto')).toBeTruthy();
  expect(dialog().querySelector('.as-inset')).toBeTruthy();
  expect(dialog().className).not.toContain('animate');
});
// Funds has its own illustrated dialog (FundsAbout), tested below.
it.each((Object.keys(PAGE_EXPLANATIONS) as ExplanationPage[]).filter(page => page !== 'funds'))('renders accurate contextual content for %s', async page => {
  await open(page);
  const content = PAGE_EXPLANATIONS[page];
  expect(dialog().textContent).toContain(content.introduction);
  for (const step of content.process.steps) expect(dialog().textContent).toContain(step.body);
  expect(dialog().textContent).toContain(content.example.body);
  for (const paragraph of content.limitations.paragraphs) expect(dialog().textContent).toContain(paragraph);
  expect(dialog().textContent).toContain(content.caveat);
});
it.each(['legacy', 'scorecard'] as const)('explains the %s ranking mode', async mode => {
  await open('stocks', mode);
  expect(dialog().textContent).toContain(mode === 'legacy' ? 'The confidence view combines price measurements' : 'Evidence depth');
});
it.each([
  ['../../pages/Assets.tsx', 'stocks'],
  ['../../pages/Funds.tsx', 'funds'],
  ['../../pages/WhaleWatching.tsx', 'whales'],
])('places the %s trigger inside its existing hero', (path, page) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function walk(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(sf) === 'className' && a.initializer?.getText(sf).includes('hero-card'))) {
      if (node.getText(sf).includes(`<AboutThisPage page="${page}"`)) found = true;
    }
    ts.forEachChild(node, walk);
  }
  walk(sf); expect(found).toBe(true); expect(source.match(/<AboutThisPage /g)).toHaveLength(1);
});
it('restores the actual trigger even when pointer activation did not focus it', async () => {
  const trigger = await mount();
  await act(async () => trigger.click());
  await act(async () => dialog().querySelector('button')!.click());
  expect(document.activeElement).toBe(trigger);
});

it('limits the new explanations to the three approved pages', () => {
  expect(Object.keys(PAGE_EXPLANATIONS).sort()).toEqual(['funds', 'stocks', 'whales']);
});

it('removes hidden stock-control wording and distinguishes run prices and dates', async () => {
  await open('stocks');
  const text = dialog().textContent!;
  expect(text).not.toMatch(/\b(?:search|filters)\b/i);
  expect(text).toContain('Also scored');
  expect(text).toContain('does not rewrite an older run');
  expect(text).toContain('not a live quote');
  expect(text).toContain('not the latest market observation');
  expect(text).toContain('no score is a probability of profit');
});
it('reuses every existing scorecard label and definition only in scorecard mode', async () => {
  const { TERM_COPY } = await import('../../data/signalCopy');
  await open('stocks', 'scorecard');
  for (const term of Object.values(TERM_COPY)) {
    expect(dialog().textContent).toContain(term.label); expect(dialog().textContent).toContain(term.detail);
  }
  await act(async () => dialog().querySelector('button')!.click());
  await open('stocks', 'legacy');
  expect(dialog().textContent).not.toContain(TERM_COPY.data_sufficiency.detail);
});
it('qualifies fund matching, unknown risk, goals, horizon, TFSA and affordability', async () => {
  await open('funds'); const text = dialog().textContent!;
  for (const phrase of ['Without a profile', 'risk-only matches', 'no available fund passed', 'five-level scale', 'seven-level indicators are converted', 'cannot pass risk-based matching', 'TFSA eligibility', 'does not infer one', 'does not confirm that contributions are affordable', 'not a finding of suitability']) expect(text).toContain(phrase);
  expect(dialog().querySelector('a')).toBeNull();
});
it('distinguishes whale transactions, dates, coverage and sources without fixed refresh promises', async () => {
  await open('whales'); const text = dialog().textContent!;
  for (const phrase of ['Open-market Buy/Sell', 'grants, exercises', 'not a ranking of investment quality', 'not the whole market', 'transaction date', 'filing or reporting date', 'information was fetched', 'Finnhub', 'yfinance', 'may be cached', 'does not establish that no activity occurred', 'does not determine']) expect(text).toContain(phrase);
  expect(text).not.toMatch(/every \d|every hour|every day|live feed/i);
});
it.each(['stocks', 'whales'] as const)('orders the %s purpose, process, example and caveats clearly', async page => {
  await open(page);
  const content = PAGE_EXPLANATIONS[page]; const text = dialog().textContent!;
  expect(text.indexOf(content.introduction)).toBeLessThan(text.indexOf(content.process.title));
  expect(text.indexOf(content.process.title)).toBeLessThan(text.indexOf(content.example.title));
  expect(text.indexOf(content.example.title)).toBeLessThan(text.indexOf(content.limitations.title));
  expect(text.indexOf(content.limitations.title)).toBeLessThan(text.indexOf(content.caveat));
  const steps = dialog().querySelector('ol')!;
  expect(steps.querySelectorAll(':scope > li')).toHaveLength(content.process.steps.length);
  expect(steps.className).toContain(`sm:grid-cols-${content.process.steps.length}`);
});
it('shows no methodology link without a valid destination', async () => {
  await act(async () => root.render(createElement(AboutThisPage, { page: 'stocks' })));
  await act(async () => container.querySelector('button')!.click());
  expect(dialog().querySelector('a')).toBeNull();
});
it('does not restore Stocks scroll onto the methodology destination', async () => {
  const router = createMemoryRouter([
    { path: '/assets', element: createElement(AboutThisPage, { page: 'stocks', methodologyHref: '/asset/AAPL/how-it-works' }) },
    { path: '/asset/AAPL/how-it-works', element: createElement('h1', {}, 'Methodology') },
  ], { initialEntries: ['/assets'] });
  try {
    await act(async () => root.render(createElement(RouterProvider, { router })));
    await act(async () => container.querySelector('button')!.click());
    await act(async () => dialog().querySelector('a')!.click());
    expect(router.state.location.pathname).toBe('/asset/AAPL/how-it-works');
    expect(container.textContent).toBe('Methodology');
    expect(main.scrollTop).toBe(0); expect(main.style.overflow).toBe('auto');
    expect(document.querySelector('dialog')).toBeNull();
  } finally { router.dispose(); }
});

it('lets the Stocks worked example switch between agreeing and conflicting evidence', async () => {
  await open('stocks', 'scorecard');
  expect(dialog().textContent).toContain('Signals agree strongly');
  const stockB = [...dialog().querySelectorAll('button')].find(button => button.textContent === 'Stock B')!;
  await act(async () => stockB.click());
  expect(stockB.getAttribute('aria-selected')).toBe('true');
  expect(dialog().textContent).toContain('the signals disagree');
});

it('shows the illustrated Funds explainer with every match limit kept', async () => {
  const copy = await import('../../utils/fundsCopy');
  await open('funds'); const text = dialog().textContent!;
  const content = PAGE_EXPLANATIONS.funds;
  expect(document.getElementById(dialog().getAttribute('aria-labelledby')!)?.textContent).toBe(copy.FUND_ABOUT_TITLE);
  expect(text).toContain(copy.FUND_ABOUT_INTRO);
  for (const step of copy.FUND_ABOUT_STEPS) expect(text).toContain(step.title);
  expect(text).toContain(copy.FUND_ABOUT_COST_TITLE);
  expect(text).toContain(content.example.body);
  for (const paragraph of content.limitations.paragraphs.slice(0, 2)) expect(text).toContain(paragraph);
  expect(text).toContain(content.caveat);
  expect(text).toContain(copy.FUND_ABOUT_FOOTER);
  expect(text.indexOf(copy.FUND_ABOUT_INTRO)).toBeLessThan(text.indexOf(content.example.body));
  expect(text.indexOf(content.example.body)).toBeLessThan(text.indexOf(content.caveat));
});
