import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AnalysisCompletionNotification from './AnalysisCompletionNotification';
import { useAnalysisNotifications } from '../store/analysisNotifications';
// SSR uses Zustand's initial snapshot; provide the live snapshot for this render check.
vi.mock('../store/analysisNotifications', async importOriginal => {
  const actual = await importOriginal<typeof import('../store/analysisNotifications')>();
  return { ...actual, useAnalysisNotifications: Object.assign(() => actual.useAnalysisNotifications.getState(), actual.useAnalysisNotifications) };
});
vi.mock('../store/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 'user' } }) }));
vi.mock('../services/api/analysis', () => ({ getStatus: vi.fn(), getResult: vi.fn() }));
afterEach(() => useAnalysisNotifications.setState({ userId: null, pending: null, ready: null, handled: [] }));
it.each(['/assets', '/settings', '/watchlist'])('shows the same notification at %s with a Stocks action', path => {
  useAnalysisNotifications.setState({ userId: 'user', ready: 'run:time' });
  const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AnalysisCompletionNotification)));
  expect(html).toContain('Your stock analysis is ready');
  expect(html).toContain('href="/assets"');
  expect(html).toContain('View analysis');
  expect(html).toContain('Dismiss analysis notification');
});
it('does not render another account’s notification', () => {
  useAnalysisNotifications.setState({ userId: 'other', ready: 'run:time' });
  expect(renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(AnalysisCompletionNotification)))).toBe('');
});
