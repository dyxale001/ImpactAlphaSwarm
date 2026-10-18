import { expect, it } from 'vitest';
import { equivalentArticleTitleOffset } from './learningArticleTitle';

it.each([
  '# Understanding Inflation',
  '## **Understanding** Inflation',
  'Understanding Inflation\n=======================',
  'Understanding Inflation\n-----------------------',
  '**Understanding Inflation**',
  '[Understanding Inflation][title]\n\n[title]: https://example.com',
  '<!-- editor note -->\n\n[title]: https://example.com\n\n# Understanding Inflation',
  '\n\n# understanding\u00a0 inflation',
])('recognizes exact opening title text in %s', content => {
  expect(equivalentArticleTitleOffset(content, 'Understanding Inflation')).toBeDefined();
});

it.each([
  'Introduction.\n\n# Understanding Inflation',
  '## Why prices change\n\n# Understanding Inflation',
  '```md\n# Understanding Inflation\n```',
  '    # Understanding Inflation',
  '> # Understanding Inflation',
  '- Understanding Inflation',
  '**Understanding Inflation** is important.',
  'Understanding Inflation\nThis is additional educational text.',
  '# Understanding Inflation and Interest',
  '---\n\n# Understanding Inflation',
])('preserves non-title content instead of searching for or loosely matching %s', content => {
  expect(equivalentArticleTitleOffset(content, 'Understanding Inflation')).toBeUndefined();
});

it('normalizes typography, Unicode and case without dropping meaningful words', () => {
  expect(equivalentArticleTitleOffset('# **Investor’s** Guide — Risk', "Investor's Guide - Risk")).toBe(0);
  expect(equivalentArticleTitleOffset('# Inflation', '')).toBeUndefined();
});
