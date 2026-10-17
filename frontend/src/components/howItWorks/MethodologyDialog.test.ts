// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MethodologyDialog from './MethodologyDialog';
import { METHODOLOGY_SECTIONS, type MethodologyKey } from './methodologySections';
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function open(section: MethodologyKey) {
  await act(async () => root.render(createElement(MethodologyDialog, { section })));
  const trigger = container.querySelector('button')!;
  await act(async () => trigger.click());
  return trigger;
}
const dialog = () => document.querySelector('dialog')!;
const title = () => document.getElementById(dialog().getAttribute('aria-labelledby')!)!.textContent;
const tabs = () => [...dialog().querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const selected = () => tabs().find(t => t.getAttribute('aria-selected') === 'true');

it('has one tab per stock page section and opens on the section it came from', async () => {
  await open('sentiment');
  expect(tabs()).toHaveLength(METHODOLOGY_SECTIONS.length);
  expect(selected()?.textContent).toContain('Sentiment');
  expect(title()).toBe(METHODOLOGY_SECTIONS.find(s => s.key === 'sentiment')!.title);
});

it('switches section in place and always reopens on its own section', async () => {
  const trigger = await open('quant');
  const sentiment = tabs().find(t => t.textContent!.includes('Sentiment'))!;
  await act(async () => sentiment.click());
  expect(title()).toBe('How the sentiment score is built');
  expect(dialog().textContent).toContain('Tier 1');
  await act(async () => (dialog().querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
  expect(document.querySelector('dialog')).toBeNull();
  await act(async () => trigger.click());
  expect(selected()?.textContent).toContain('Quant');
});

it('states the corrected momentum direction and the rand chart', async () => {
  await open('quant');
  const text = dialog().textContent!;
  expect(text).toContain('Higher means the price rose more strongly than its peers');
  expect(text).toContain('converted to rand');
  expect(text).not.toContain('either direction of travel');
});
