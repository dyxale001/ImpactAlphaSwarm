// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import LearnPopover from './LearnPopover';
const mocks=vi.hoisted(()=>({ catalogue:vi.fn() }));
vi.mock('../../services/supabase/learningRecommendations',()=>({recommendationCatalogue:mocks.catalogue}));
vi.mock('../../store/authStore',()=>({useAuthStore:(select:any)=>select({user:{id:'user'}})}));
let root:Root, container:HTMLDivElement;
const article=(id:string,tag:string)=>({id,title:id,summary:'Summary',tags:[tag],display_order:1});
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  mocks.catalogue.mockResolvedValue([article('Quant','quant-analysis'),article('Sentiment','sentiment-analysis')]);
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(context:string){await act(async()=>root.render(createElement(MemoryRouter,{},createElement(LearnPopover,{context:context as any}))));}
const trigger=()=>container.querySelector('button[aria-label="Learn as you explore"]') as HTMLButtonElement;
it('is a closed book button until pressed, then lists the lessons for its context',async()=>{
  await render('stock.quant');
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('section')).toBeNull();
  await act(async()=>trigger().click());
  const panel=document.getElementById(trigger().getAttribute('aria-controls')!)!;
  expect(panel.querySelector('a')?.getAttribute('href')).toBe('/learning?article=Quant');
  expect(panel.textContent).not.toContain('Sentiment');
});
it('closes on Escape, returning focus to the button, and on a click outside',async()=>{
  await render('stock.quant');
  await act(async()=>trigger().click());
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger());
  await act(async()=>trigger().click());
  await act(async()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
});
it('renders nothing when the context has no lessons',async()=>{
  await render('stock.insiders');
  expect(trigger()).toBeNull();
});
