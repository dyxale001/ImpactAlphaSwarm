import { expect, it } from 'vitest';
import { articleLinkParams, resolveArticle } from './learningArticleLinks';
it('opens, refreshes, closes and resolves browser history parameters', () => {
  const articles = [{ id: '1' }, { id: '2' }];
  const first = articleLinkParams(new URLSearchParams('tab=library'), '1');
  const second = articleLinkParams(first, '2');
  expect(resolveArticle(articles, new URLSearchParams(first.toString()))).toBe(articles[0]);
  expect(resolveArticle(articles, second)).toBe(articles[1]);
  expect(resolveArticle(articles, first)).toBe(articles[0]);
  expect(resolveArticle(articles, second)).toBe(articles[1]);
  const closed = articleLinkParams(second, null);
  expect(closed.get('tab')).toBe('library'); expect(resolveArticle(articles, closed)).toBeNull();
});
it('handles deleted and missing articles', () => expect(resolveArticle([], new URLSearchParams('article=gone'))).toBeNull());
