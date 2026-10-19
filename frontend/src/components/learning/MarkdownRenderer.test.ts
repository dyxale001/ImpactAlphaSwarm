// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import MarkdownRenderer from './MarkdownRenderer';

function render(content: string) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));
  return host;
}

it.each([
  '```js\nconst example = true\n```',
  '```\nconst example = true\n```',
  '    const example = true',
])('renders dark code on a light background for %s', content => {
  const host = render(content);
  const pre = host.querySelector('pre')!;
  const code = pre.querySelector('code')!;
  expect(code.textContent).toBe('const example = true\n');
  expect(pre.classList.contains('bg-forest-50')).toBe(true);
  expect(pre.classList.contains('text-forest-900')).toBe(true);
  expect(code.classList.contains('bg-forest-50')).toBe(true);
  expect(code.classList.contains('text-forest-900')).toBe(true);
  expect(code.classList.contains('text-brand-bg')).toBe(false);
  expect(pre.classList.contains('bg-brand-forest-950')).toBe(false);
});

it('keeps inline code readable without turning it into a block', () => {
  const host = render('Use `const example = true` here.');
  const code = host.querySelector('p > code')!;
  expect(code.textContent).toBe('const example = true');
  expect(code.classList.contains('text-forest-900')).toBe(true);
  expect(code.classList.contains('bg-forest-50')).toBe(true);
  expect(host.querySelector('pre')).toBeNull();
});

it('escapes code examples while preserving text and line breaks', () => {
  const host = render('```html\n<script>alert("example")</script>\n<div>Example</div>\n```');
  expect(host.querySelector('pre code')?.textContent).toBe('<script>alert("example")</script>\n<div>Example</div>\n');
  expect(host.querySelector('script')).toBeNull();
});
