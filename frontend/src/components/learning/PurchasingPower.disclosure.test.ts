// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import PurchasingPower from './PurchasingPower';

it('shows the panel with Edit closed, and keeps edited assumptions, values and validation across reopening', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    const [rate, setRate] = useState('5');
    return createElement(PurchasingPower, { futureValue: 10000, years: 10, inflationRate: rate, onInflationChange: setRate });
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    // The panel is always in view under the result; only the inflation editor folds.
    expect(container.querySelector('section[aria-label="In today’s money"]')).not.toBeNull();
    const editor = container.querySelector('details')!;
    expect(editor.open).toBe(false);
    expect(editor.querySelector('summary')?.textContent).toBe('Edit');
    editor.open = true;
    const input = editor.querySelector('input')!;
    async function edit(value: string) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await edit('10');
    expect(container.textContent).toContain('Based on 10% assumed annual inflation');
    const values = container.querySelector('dl')!.textContent;
    editor.open = false; editor.open = true;
    expect(editor.querySelector('input')).toBe(input);
    expect(input.value).toBe('10');
    expect(container.querySelector('dl')!.textContent).toBe(values);
    await edit('-1');
    editor.open = false; editor.open = true;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain('Enter an inflation rate from 0 to 100%');
    expect(container.querySelector('dl')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
