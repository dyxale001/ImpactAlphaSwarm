import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ArticleViewerModal from './ResourceViewerModal';
import type { LearningArticle } from '../../types/learning';

function render(content: string, video_url?: string, title = 'Understanding Inflation') {
  return renderToStaticMarkup(createElement(ArticleViewerModal, {
    article: { id: 'a', title, content, video_url, summary: 'Keep this summary', difficulty_level: 'BEGINNER', quiz_question_count: 1 } as LearningArticle,
    onClose: () => {}, onStartQuiz: () => {},
  }));
}
it.each(['# Understanding Inflation', '# **Understanding** [Inflation](https://example.com)', 'Understanding Inflation\n=======================', '# understanding   inflation'])('keeps only the content title for %s', content => {
  const html = render(content + '\n\n## Internal heading\n\nEducational content.');
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).not.toContain('<h1 class="text-2xl font-semibold">');
  expect(html).toContain('role="dialog" aria-modal="true" aria-label="Understanding Inflation"');
  expect(html).toContain('Internal heading');
  expect(html).not.toContain('Keep this summary');
  expect(html).toContain('Educational content.');
  expect(html).toContain('Take Quiz');
});
it.each(['No heading here.', '# Another topic', '```md\n# Understanding Inflation\n```', 'Introduction\n\n## Understanding Inflation'])('retains a metadata title for %s', content => {
  const html = render(content);
  expect(html).toMatch(/<h1[^>]*bg-brand-accent\/15[^>]*>Understanding Inflation<\/h1>/);
});

it.each(['# Understanding Inflation', '# **Understanding** [Inflation](https://example.com)', 'Understanding Inflation\n=======================', 'No heading here.'])('places video after the title and before the body: %s', heading => {
  const html = render(heading + '\n\nBody after video.\n\n## Later heading', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  expect(html.indexOf('</h1>')).toBeLessThan(html.indexOf('<iframe'));
  expect(html.indexOf('<iframe')).toBeLessThan(html.indexOf('Body after video.'));
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html.match(/<iframe\b/g)).toHaveLength(1);
  expect(html).toContain('Later heading');
  expect(html).toContain('aspect-video');
  expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
  expect(html.indexOf('Body after video.')).toBeLessThan(html.indexOf('Take Quiz'));
});
it('preserves authored text and reference links without a video', () => {
  const html = render('# Understanding Inflation\n\nAuthored grey description. [Read more][source]\n\n[source]: https://example.com');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('Keep this summary');
  expect(html).toContain('Authored grey description.');
  expect(html).toContain('href="https://example.com"');
  expect(html.match(/<h1\b/g)).toHaveLength(1);
});

it.each([
  '## Understanding Inflation',
  '### **Understanding** Inflation',
  'Understanding Inflation\n-----------------------',
  '**Understanding Inflation**',
  '*Understanding Inflation*',
  'Understanding Inflation',
  '<!-- CMS note -->\n\n# Understanding Inflation',
  '[topic]: https://example.com\n\n# Understanding [Inflation][topic]',
  '\uFEFF# Understanding Inflation',
  '# Understanding\u00a0Inflation',
])('normalizes the opening title and places video immediately afterward: %s', title => {
  const html = render(title + '\n\n## Why prices change\n\nKeep all this content.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toMatch(/<h1[^>]*bg-brand-accent\/15/);
  expect(html.indexOf('</h1>')).toBeLessThan(html.indexOf('<iframe'));
  expect(html.indexOf('<iframe')).toBeLessThan(html.indexOf('Why prices change'));
  expect(html).toContain('Keep all this content.');
  expect(html).toContain('Take Quiz');
});

it('preserves reference-link formatting in a promoted title and the remaining body', () => {
  const html = render('[guide]: https://example.com/guide\n\n**Understanding [Inflation][guide]**\n\nRead the [guide][guide].');
  expect(html.match(/href="https:\/\/example.com\/guide"/g)).toHaveLength(2);
  expect(html).toContain('<strong');
  expect(html).toContain('Read the');
  expect(html.match(/<h1\b/g)).toHaveLength(1);
});

it('does not remove a genuine matching section after introductory content', () => {
  const html = render('Introduction that must stay.\n\n## Understanding Inflation\n\nAn educational section.');
  expect(html).toContain('Introduction that must stay.');
  expect(html).toMatch(/<h2[^>]*>Understanding Inflation<\/h2>/);
  expect(html).toContain('An educational section.');
});

it('renders fallback metadata as literal text using the same title style', () => {
  const html = render('Preserved body.', undefined, '[Not a link](https://example.com)');
  expect(html).toContain('[Not a link](https://example.com)');
  expect(html).not.toContain('<a ');
  expect(html).toMatch(/<h1[^>]*bg-brand-accent\/15/);
});

it('keeps the title, video and quiz available even for an empty Markdown body', () => {
  const html = render('', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html.match(/<iframe\b/g)).toHaveLength(1);
  expect(html.indexOf('</h1>')).toBeLessThan(html.indexOf('<iframe'));
  expect(html.indexOf('<iframe')).toBeLessThan(html.indexOf('Take Quiz'));
});
