// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ request:vi.fn() }));
vi.mock('../../lib/supabase',()=>({supabase:{from:()=>({select:()=>mocks.request()})}}));
vi.mock('../../store/authStore',async()=>{const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A'} as {id:string}|null}))};});
let root:Root, container:HTMLDivElement, Panel:typeof import('./LearnMore')['default'];
const articles=(name:string)=>[{id:name,title:name,summary:'Summary',tags:['stocks'],display_order:1}];
beforeEach(async()=>{
  vi.resetModules();vi.useFakeTimers();mocks.request.mockReset();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  // Module cache is reset for each test; use its matching account store too.
  const auth=await import('../../store/authStore');auth.useAuthStore.setState({user:{id:'A'} as any});
  Panel=(await import('./LearnMore')).default;
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();});
async function mount(two=false){await act(async()=>root.render(createElement(MemoryRouter,{},createElement('div',{},createElement(Panel,{context:'stocks'}),two?createElement(Panel,{context:'stocks'}):null))));}
it('recovers initial failure after five seconds and stops retrying after success',async()=>{
  mocks.request.mockResolvedValueOnce({data:null,error:Error('network')}).mockResolvedValue({data:articles('Recovered'),error:null});
  await mount();expect(container.textContent).toBe('');expect(mocks.request).toHaveBeenCalledTimes(1);
  await act(async()=>vi.advanceTimersByTimeAsync(5000));expect(container.textContent).toContain('Recovered');
  await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(mocks.request).toHaveBeenCalledTimes(2);
});
it('stops after two spaced retries and cleans timers on unmount',async()=>{
  mocks.request.mockResolvedValue({data:null,error:Error('network')});await mount();
  await act(async()=>vi.advanceTimersByTimeAsync(5000));await act(async()=>vi.advanceTimersByTimeAsync(15000));
  expect(mocks.request).toHaveBeenCalledTimes(3);await act(async()=>vi.advanceTimersByTimeAsync(120000));expect(mocks.request).toHaveBeenCalledTimes(3);
});
it('shares concurrent requests across panels',async()=>{
  let resolve!:(value:any)=>void;mocks.request.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  await mount(true);expect(mocks.request).toHaveBeenCalledTimes(1);
  await act(async()=>resolve({data:articles('Shared'),error:null}));expect(container.textContent).toContain('Shared');
});
it('Refresh reloads an already-mounted catalogue',async()=>{
  mocks.request.mockResolvedValueOnce({data:articles('Before'),error:null}).mockResolvedValueOnce({data:articles('After'),error:null});await mount();
  await act(async()=>[...container.querySelectorAll('button')].find(button => button.textContent === 'Refresh')!.click());expect(container.textContent).toContain('After');expect(container.textContent).not.toContain('Before');expect(mocks.request).toHaveBeenCalledTimes(2);
});
it('isolates accounts and ignores late responses from a prior account',async()=>{
  let resolve!:(value:any)=>void;mocks.request.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({data:articles('Account B'),error:null});await mount();
  const auth=await import('../../store/authStore');
  await act(async()=>auth.useAuthStore.setState({user:{id:'B'} as any}));expect(container.textContent).toContain('Account B');
  await act(async()=>resolve({data:articles('Account A'),error:null}));expect(container.textContent).not.toContain('Account A');
  await act(async()=>auth.useAuthStore.setState({user:null}));expect(container.textContent).toBe('');
});

it('cancels a scheduled retry when the panel unmounts',async()=>{
  mocks.request.mockResolvedValue({data:null,error:Error('network')});await mount();
  await act(async()=>root.render(createElement('div')));
  await act(async()=>vi.advanceTimersByTimeAsync(30000));expect(mocks.request).toHaveBeenCalledTimes(1);
});

it('reflects newly tagged records and removes records with no matching tags after Refresh',async()=>{
 mocks.request.mockResolvedValueOnce({data:articles('Original'),error:null})
   .mockResolvedValueOnce({data:articles('Newly tagged'),error:null})
   .mockResolvedValueOnce({data:[{...articles('Newly tagged')[0],tags:[]}],error:null});
 await mount();
 const refresh=()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Refresh')!;
 await act(async()=>refresh().click());expect(container.textContent).toContain('Newly tagged');expect(container.textContent).not.toContain('Original');
 await act(async()=>refresh().click());expect(container.textContent).toBe('');expect(mocks.request).toHaveBeenCalledTimes(3);
});
it('reuses fresh cache on remount and fetches once its sixty-second lifetime expires',async()=>{
 mocks.request.mockResolvedValue({data:articles('Cached'),error:null});await mount();
 await act(async()=>root.render(createElement('div')));await mount();expect(mocks.request).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(createElement('div')));await act(async()=>vi.advanceTimersByTimeAsync(60001));
 await mount();expect(mocks.request).toHaveBeenCalledTimes(2);
});
it('shares manual refresh while another request is still in flight',async()=>{
 mocks.request.mockResolvedValueOnce({data:articles('Original'),error:null});await mount();
 let resolve!:(value:any)=>void;mocks.request.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const refresh=()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Refresh')!;
 await act(async()=>refresh().click());await act(async()=>refresh().click());expect(mocks.request).toHaveBeenCalledTimes(2);
 await act(async()=>resolve({data:articles('Updated'),error:null}));expect(container.textContent).toContain('Updated');
});
