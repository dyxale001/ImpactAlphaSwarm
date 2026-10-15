import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ArticleViewerModal from './ResourceViewerModal';
import type { LearningArticle } from '../../types/learning';

function render(content: string, video_url?: string) {
  return renderToStaticMarkup(createElement(ArticleViewerModal, {
    article: { id: 'a', title: 'Understanding Inflation', content, video_url, summary: 'Keep this summary', difficulty_level: 'BEGINNER', quiz_question_count: 1 } as LearningArticle,
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
  expect(html).toContain('<h1 class="text-2xl font-semibold">Understanding Inflation</h1>');
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
