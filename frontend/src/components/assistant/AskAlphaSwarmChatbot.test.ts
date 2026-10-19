// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import AskAlphaSwarmChatbot from './AskAlphaSwarmChatbot';
import { useAskChatbotStore } from '../../store/askChatbotStore';
vi.mock('../../hooks/useAskAlphaSwarm',()=>({useAskAlphaSwarm:()=>({turns:[],query:'',setQuery:()=>{},pendingQuestion:null,loading:false,error:null,ask:()=>{},reset:()=>{}})}));
vi.mock('../ask/AskMascot',()=>({default:()=>null}));
let root:Root, container:HTMLDivElement;
// A phone: narrow and touch. A desktop: wide with a mouse.
function device(phone:boolean){
  window.matchMedia=((query:string)=>({matches:phone&&(query.includes('max-width')||query.includes('coarse')),media:query,addEventListener:()=>{},removeEventListener:()=>{}})) as any;
}
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  Element.prototype.scrollTo=()=>{};
  useAskChatbotStore.setState({open:false,pendingPrompt:null});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function openPanel(){
  await act(async()=>root.render(createElement(MemoryRouter,{},createElement(AskAlphaSwarmChatbot))));
  await act(async()=>useAskChatbotStore.getState().setOpen(true));
}
const dialog=()=>container.querySelector('[role="dialog"]') as HTMLElement;
const input=()=>container.querySelector('input') as HTMLInputElement;
const trigger=()=>container.querySelector('[data-spotlight="floating-assistant"]')!.parentElement as HTMLElement;
it('opens as a full-screen sheet on a phone without raising the keyboard',async()=>{
  device(true);
  await openPanel();
  expect(dialog().className).toContain('fixed');
  expect(document.activeElement).not.toBe(input());
  expect(trigger().className).toContain('hidden');
});
it('hides What can I ask? on the sheet while typing',async()=>{
  device(true);
  await openPanel();
  expect(dialog().textContent).toContain('What can I ask?');
  await act(async()=>input().focus());
  expect(dialog().textContent).not.toContain('What can I ask?');
});
it('keeps the floating card and focuses the composer on a desktop',async()=>{
  device(false);
  await openPanel();
  expect(dialog().className).not.toContain('fixed');
  expect(document.activeElement).toBe(input());
  expect(trigger().className).not.toContain('hidden');
});
