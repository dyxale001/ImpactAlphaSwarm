import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
const data = vi.hoisted(() => ({ articles: [
  { id: '1', title: 'Quant lesson', summary: 'Read the numbers', tags: ['quant-analysis'], display_order: 1 },
  { id: '2', title: 'Unrelated lesson', summary: 'Not relevant', tags: [], display_order: 1 },
] }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => initial === null ? [{ userId: 'user', articles: data.articles }, vi.fn()] : actual.useState(initial) };
});
vi.mock('../../store/authStore', () => ({ useAuthStore: (select: (value: unknown) => unknown) => select({ user: { id: 'user' } }) }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import LearnMore from './LearnMore';
it('renders only tagged recommendations with direct article links', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(LearnMore, { context: 'stock.quant' })));
  expect(html).toContain('Quant lesson'); expect(html).toContain('/learning?article=1'); expect(html).not.toContain('Unrelated lesson');
});
it('hides the entire panel with no matching articles', () => {
  expect(renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(LearnMore, { context: 'tools.tfsa' })))).toBe('');
});
it('avoids duplicating a dashboard lesson already shown', () => {
  expect(renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(LearnMore, { context: 'stock.quant', excludeArticleId: '1' })))).toBe('');
});
