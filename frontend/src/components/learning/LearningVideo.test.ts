import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import LearningVideo from './LearningVideo';
import ArticleViewer from './ResourceViewerModal';
import MarkdownRenderer from './MarkdownRenderer';
it('renders responsive provider-only video without autoplay', () => {
  const html = renderToStaticMarkup(createElement(LearningVideo, { url: 'https://youtu.be/dQw4w9WgXcQ' }));
  expect(html).toContain('aspect-video'); expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  expect(html).toContain('sandbox='); expect(html).not.toContain('autoplay');
});
it.each([null, '', 'https://evil.test/iframe'])('renders no empty player for %s', url => expect(renderToStaticMarkup(createElement(LearningVideo, {url}))).toBe(''));
it('preserves written article and quiz controls with optional video', () => {
  const article = { id: '1', category_id: '1', title: 'Lesson', slug: 'lesson', summary: 'Summary', content: 'Written lesson', difficulty_level: 'BEGINNER' as const, display_order: 1, created_at: '', questions: [], quiz_question_count: 1, video_url: 'https://vimeo.com/123' };
  const html = renderToStaticMarkup(createElement(ArticleViewer, { article, onClose: () => {}, onStartQuiz: () => {} }));
  expect(html).toContain('Written lesson'); expect(html).toContain('Take Quiz'); expect(html).toContain('player.vimeo.com/video/123');
  const plain = renderToStaticMarkup(createElement(ArticleViewer, { article: {...article, video_url: null}, onClose: () => {}, onStartQuiz: () => {} }));
  expect(plain).not.toContain('<iframe'); expect(plain).toContain('Written lesson'); expect(plain).toContain('Take Quiz');
});
it('does not enable raw HTML or script links in Markdown', () => {
  const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content: '<script>alert(1)</script>\n\n[bad](javascript:alert)' }));
  expect(html).not.toContain('<script>'); expect(html).not.toContain('href="javascript:');
});
