// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NewsEvidencePanel from './NewsEvidencePanel';
vi.mock('./SentimentTrendChart', () => ({ SentimentTrendChart: () => null }));
let root: Root, container: HTMLDivElement;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const article = { source: 'Reuters', tier: 1, date: '2026-10-16', headline: 'Stored headline', sentiment: 'Positive', sentiment_score: 70, influence: 50 };
const history = (articles: any[]) => ({
  points: [{ date: '2026-10-16', score: 60, post_count: 3, bullish: 1, bearish: 0, top_posts: [], summary: null,
    news_count: articles.length, news_score: articles.length ? 70 : null, news_bullish: 1, news_bearish: 0, top_articles: articles }],
  daysWithData: 1, isLoading: false, isSeeding: false, error: null,
}) as any;

it('lists the stored daily news even when the latest run has no recommendation', async () => {
  await act(async () => root.render(createElement(NewsEvidencePanel, { recommendation: null, history: history([article]) })));
  expect(container.textContent).toContain('Stored headline');
  expect(container.textContent).not.toContain('No news articles have been collected');
});

it('says so only when no day carries any articles', async () => {
  await act(async () => root.render(createElement(NewsEvidencePanel, { recommendation: null, history: history([]) })));
  expect(container.textContent).toContain('No news articles have been collected for this stock in the last 7 days.');
});
