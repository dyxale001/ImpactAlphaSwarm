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
