import { expect, it } from 'vitest';
import { normalizeLearningTags, relatedArticles, LEARNING_CONTEXTS, LEARNING_TAGS } from './learningContexts';
it('normalizes, deduplicates and rejects uncontrolled tags', () => {
  expect(normalizeLearningTags([' STOCKS ', 'stocks', 'bad', null])).toEqual(['stocks']);
  expect(normalizeLearningTags(null)).toEqual([]);
});
it('has only controlled tags in every context', () => {
  for (const tags of Object.values(LEARNING_CONTEXTS)) for (const tag of tags) expect(LEARNING_TAGS).toHaveProperty(tag);
});
const article = (id: string, tags: string[] | null) => ({ id, tags, title: id, summary: '', display_order: 1 });
it('never falls back to untagged or unrelated articles', () => {
  expect(relatedArticles([article('1', []), article('2', null), article('3', ['stocks'])], 'tools.tfsa')).toEqual([]);
});
it('prioritizes features, deduplicates and limits deterministically', () => {
  const specific = article('2', ['compound-interest']);
  const input = [article('1', ['financial-tools']), specific, specific, article('3', ['investment-growth']), article('4', ['purchasing-power'])];
  expect(relatedArticles(input, 'tools.growth').map(a => a.id)).toEqual(['2', '3', '4']);
  expect(relatedArticles([...input].reverse(), 'tools.growth').map(a => a.id)).toEqual(['2', '3', '4']);
});
it('updates matching for stock tabs, calculator modes and compare kinds', () => {
  const articles = [article('1', ['quant-analysis']), article('2', ['sentiment-analysis']), article('3', ['investment-goals']), article('4', ['tfsa-planning']), article('5', ['compare-funds'])];
  expect(relatedArticles(articles, 'stock.quant').map(a=>a.id)).toEqual(['1']);
  expect(relatedArticles(articles, 'stock.sentiment').map(a=>a.id)).toEqual(['2']);
  expect(relatedArticles(articles, 'tools.goal').map(a=>a.id)).toEqual(['3']);
  expect(relatedArticles(articles, 'tools.tfsa').map(a=>a.id)).toEqual(['4']);
  expect(relatedArticles(articles, 'compare.stocks')).toEqual([]);
  expect(relatedArticles(articles, 'compare.funds').map(a=>a.id)).toEqual(['5']);
});
