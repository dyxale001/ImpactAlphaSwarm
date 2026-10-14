// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import LearnMore from './LearnMore';
import FinancialTools from './FinancialTools';
const mocks=vi.hoisted(()=>({ catalogue:vi.fn() }));
vi.mock('../../services/supabase/learningRecommendations',()=>({recommendationCatalogue:mocks.catalogue}));
vi.mock('../../store/authStore',()=>({useAuthStore:(select:any)=>select({user:{id:'user'}})}));
vi.mock('recharts',()=>({ResponsiveContainer:()=>null,CartesianGrid:()=>null,Line:()=>null,LineChart:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null,Legend:()=>null,ReferenceLine:()=>null}));
let root:Root, container:HTMLDivElement;
const article=(id:string,tag:string)=>({id,title:id,summary:'Summary',tags:[tag],display_order:1});
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();
  mocks.catalogue.mockResolvedValue([article('Risk','risk-profile'),article('Goals','investment-goals'),article('Sectors','investment-sectors'),article('Growth','compound-interest'),article('TFSA','tfsa-planning'),article('Quant','quant-analysis'),article('Sentiment','sentiment-analysis')]);
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(props:any,key='same'){await act(async()=>root.render(createElement(MemoryRouter,{key},createElement(LearnMore,props))));}
const toggle=()=>container.querySelector('button[aria-expanded]') as HTMLButtonElement;
async function click(button:HTMLElement){await act(async()=>button.click());}
it('defaults collapsed, exposes accessible controls and keeps Refresh inside the hidden panel',async()=>{
  await render({context:'stock.quant'});expect(toggle().getAttribute('aria-expanded')).toBe('false');
  const panel=document.getElementById(toggle().getAttribute('aria-controls')!)!;
  expect(panel.hidden).toBe(true);expect(panel.textContent).toContain('Refresh');
  expect(toggle().type).toBe('button');toggle().focus();expect(document.activeElement).toBe(toggle());
  await click(toggle());expect(panel.hidden).toBe(false);expect(toggle().getAttribute('aria-expanded')).toBe('true');
  expect(panel.querySelector('.grid')?.className).toContain('sm:grid-cols-3');
  expect(panel.querySelector('a')?.getAttribute('href')).toBe('/learning?article=Quant');
});
it('remembers disclosure across page remounts for this browser session',async()=>{
  await render({context:'stock.quant'});await click(toggle());
  expect(sessionStorage.getItem('alphaswarm:learning-callout-expanded')).toBe('true');
  await render({context:'stock.sentiment'},'next-page');expect(toggle().getAttribute('aria-expanded')).toBe('true');
  await click(toggle());await render({context:'stock.quant'},'another-page');expect(toggle().getAttribute('aria-expanded')).toBe('false');
});
it('updates one callout with active context, without mixing recommendations',async()=>{
  await render({context:'stock.quant'});await click(toggle());expect(container.querySelector('a')?.textContent).toContain('Quant');
  await render({context:'stock.sentiment'});expect(container.querySelector('a')?.textContent).toContain('Sentiment');
  expect(container.querySelectorAll('section[aria-label="Learn as you explore"]')).toHaveLength(1);
});
it('hides the whole callout when no article matches',async()=>{
  await render({context:'ask'});expect(container.textContent).toBe('');
});
it('selects individual Settings topics and replaces them on section switching',async()=>{
  await render({context:'settings.risk',topics:[{context:'settings.risk',label:'Risk Profile'},{context:'settings.goals',label:'Investment Goals'}]});await click(toggle());
  const select=container.querySelector('select')!;
  await act(async()=>{select.value='settings.goals';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(container.querySelector('a')?.textContent).toContain('Goals');
  await render({context:'settings.sectors',topics:[{context:'settings.sectors',label:'Investment Sectors'},{context:'settings.expertise',label:'Expertise'}]});
  expect(container.querySelector('a')?.textContent).toContain('Sectors');expect(container.querySelector('select')).toBeNull();
});
it('switches calculator contexts without changing entered amounts or projections',async()=>{
  await act(async()=>root.render(createElement(MemoryRouter,{},createElement(FinancialTools))));
  const input=container.querySelector('#compound-initialInvestment') as HTMLInputElement;
  const nominal=container.querySelector('[aria-live="polite"]')!.textContent;
  const find=(label:string)=>[...container.querySelectorAll('button')].find(button=>button.textContent===label)!;
  await click(find('Plan a Goal'));expect(container.querySelector('a')?.textContent).toContain('Goals');
  await click(find('TFSA Planner'));expect(container.querySelector('a')?.textContent).toContain('TFSA');
  await click(find('Investment Growth & Goal Planner'));await click(find('Project Growth'));
  expect(input.value).toBe('10000');expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe(nominal);
  expect(container.querySelector('a')?.textContent).toContain('Growth');
  expect(container.querySelectorAll('section[aria-label="Learn as you explore"]')).toHaveLength(1);
});

it('applies optional spacing only when matching content exists',async()=>{
 await render({context:'stock.quant',className:'mt-6'});
 expect(container.querySelector('section')?.className).toContain('mt-6');
 await render({context:'ask',className:'mt-6'});expect(container.textContent).toBe('');expect(container.querySelector('section')).toBeNull();
});
it('uses one forest page header followed by the callout and calculator controls',async()=>{
 await act(async()=>root.render(createElement(MemoryRouter,{},createElement(FinancialTools))));
 const header=container.querySelector('header')!;
 expect(header.className).toContain('hero-card');expect(header.className).toContain('px-5 sm:px-7 pt-8 pb-12 sm:pb-16');
 expect(header.querySelector('h1')?.textContent).toBe('Financial Tools');expect(container.querySelectorAll('h1')).toHaveLength(1);
 expect(header.textContent).toContain('Plan your investments, explore potential growth, and understand your financial future.');
 expect(header.nextElementSibling?.getAttribute('aria-label')).toBe('Learn as you explore');
 expect(header.nextElementSibling?.nextElementSibling?.getAttribute('aria-label')).toBe('Choose a financial tool');
 expect(header.parentElement?.className).toContain('space-y-6');
 expect(container.textContent).not.toContain('Put your learning into practice');
});
