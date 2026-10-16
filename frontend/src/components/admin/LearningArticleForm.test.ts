import { expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => [initial, vi.fn()] };
});
import LearningArticleForm from './LearningArticleForm';
import type { LearningArticleFormValues } from '../../hooks/useAdminLearningArticles';
function inputs(node: unknown): ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(inputs);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as ReactElement<Record<string, any>>;
  return [...(element.type === 'input' && element.props.type === 'checkbox' ? [element] : []), ...inputs(element.props.children)];
}
it('selects and removes controlled tags using current CMS values', () => {
  let values: LearningArticleFormValues = { title: '', slug: '', content: '', summary: '', category_id: '', difficulty_level: '', display_order: '', tags: [], video_url: '' };
  const change = vi.fn((field: keyof LearningArticleFormValues, value: any) => { values = { ...values, [field]: value }; });
  const render = () => LearningArticleForm({ values, categories: [], isEditing: true, isSaving: false, formError: null, onSubmit: vi.fn(), onReset: vi.fn(), onChange: change });
  const first = inputs(render())[0];
  expect(first.props.checked).toBe(false);
  first.props.onChange({ target: { checked: true } });
  expect(values.tags).toEqual(['dashboard']);
  const selected = inputs(render())[0]; expect(selected.props.checked).toBe(true);
  selected.props.onChange({ target: { checked: false } }); expect(values.tags).toEqual([]);
});

it('groups every controlled tag once without changing its value', async () => {
  const { LEARNING_TAG_GROUPS } = await import('./learningTagGroups');
  const { LEARNING_TAGS } = await import('../../data/learningContexts');
  const tags = LEARNING_TAG_GROUPS.flatMap(group => group.tags);
  expect(tags.length).toBe(new Set(tags).size);
  expect([...tags].sort()).toEqual(Object.keys(LEARNING_TAGS).sort());
  expect(LEARNING_TAG_GROUPS.every(group => group.label && group.tags.length)).toBe(true);
});
it('preserves existing selections from multiple groups through edits and submit', () => {
  let values: LearningArticleFormValues = { title: 'Existing', slug: 'existing', content: 'Body', summary: 'Summary', category_id: 'c', difficulty_level: 'BEGINNER', display_order: '1', tags: ['tfsa-planning', 'stock-analysis'], video_url: '' };
  const onSubmit = vi.fn();
  const render = () => LearningArticleForm({ values, categories: [], isEditing: true, isSaving: false, formError: null, onSubmit, onReset: vi.fn(), onChange: (field, value) => { values = { ...values, [field]: value }; } });
  expect(inputs(render()).filter(input => input.props.checked)).toHaveLength(2);
  inputs(render())[0].props.onChange({ target: { checked: true } });
  expect(values.tags).toEqual(['tfsa-planning', 'stock-analysis', 'dashboard']);
  inputs(render())[0].props.onChange({ target: { checked: false } });
  expect(values.tags).toEqual(['tfsa-planning', 'stock-analysis']);
  const event = { preventDefault: vi.fn() };
  render().props.onSubmit(event);
  expect(onSubmit).toHaveBeenCalledWith(event);
});

it('renders named accessible groups with native labelled checkboxes', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { LEARNING_TAG_GROUPS } = await import('./learningTagGroups');
  const values: LearningArticleFormValues = { title: '', slug: '', content: '', summary: '', category_id: '', difficulty_level: '', display_order: '', tags: ['tfsa-planning'], video_url: '' };
  const html = renderToStaticMarkup(createElement(LearningArticleForm, { values, categories: [], isEditing: true, isSaving: false, formError: null, onSubmit: vi.fn(), onReset: vi.fn(), onChange: vi.fn() }));
  for (const group of LEARNING_TAG_GROUPS) expect(html).toContain(`>${group.label}</legend>`);
  expect(html).toContain('type="checkbox" checked=""');
  expect(html).toContain('TFSA planning');
});
