// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KeyReadings from './KeyReadings';
vi.mock('../../hooks/useInstitutionalData', () => ({
  useInstitutionalData: () => ({ data: { institutions_pct: 0.614, institutions_count: 4370 }, isLoading: false, error: null }),
}));
vi.mock('../../hooks/useWhaleData', () => ({
  useWhaleData: () => ({
    transactions: [
      { type: 'buy', transaction_code: 'P' },
      { type: 'sell', transaction_code: 'S' },
      { type: 'sell', transaction_code: 'S' },
      { type: 'buy', transaction_code: 'A' },
    ],
    windowDays: 90, isLoading: false, error: null,
  }),
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('shows one figure per tab, counting only open-market trades as bought or sold', async () => {
  const onOpen = vi.fn();
  await act(async () => root.render(createElement(KeyReadings, { ticker: 'NVDA', sentimentScore: 64, quantPercentile: 84, onOpen })));
  const text = container.textContent!;
  expect(text).toContain('64 / 100'); expect(text).toContain('Positive');
  expect(text).toContain('84th percentile');
  expect(text).toContain('61.4% held'); expect(text).toContain('By 4,370 institutions');
  expect(text).toContain('4 in 90 days'); expect(text).toContain('1 bought, 2 sold on the market');
  const buttons = [...container.querySelectorAll('button')];
  expect(buttons).toHaveLength(4);
  await act(async () => buttons[3].click());
  expect(onOpen).toHaveBeenCalledWith('insiders');
});
