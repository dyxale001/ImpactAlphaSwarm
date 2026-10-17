// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import LearningPage from './Learning';
import AppLayout from '../components/layout/AppLayout';
vi.mock('../components/assistant/AskAlphaSwarmChatbot', () => ({ default: () => null }));
vi.mock('../components/AnalysisCompletionNotification', () => ({ default: () => null }));
vi.mock('../hooks/useSignOut', () => ({ useSignOut: () => vi.fn() }));
const mocks = vi.hoisted(() => ({ content: vi.fn(), badges: vi.fn(), state: vi.fn(), submit: vi.fn() }));
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ session:{user:{id:'user'}},profile:{id:'user'},analysis:null,isProfileLoading:false,fetchProfile:vi.fn() }) }));
vi.mock('../services/supabase/learningService', () => ({ fetchLearningCentreData:mocks.content,fetchLearningBadges:mocks.badges,fetchLearningUserState:mocks.state,submitLearningQuiz:mocks.submit }));
vi.mock('../components/learning/LearningRoadmap', () => ({ default: ({categories,onOpenArticle,onOpenFinancialTools}:any) => createElement('div',{},createElement('button',{onClick:onOpenFinancialTools},'Explore Financial Tools'),...categories.flatMap((c:any)=>c.articles.map((a:any)=>createElement('button',{key:a.id,onClick:()=>onOpenArticle(a)},`Read ${a.id}`)))) }));
vi.mock('../components/learning/LearningCategorySection', () => ({default:()=>null}));
vi.mock('../components/learning/LearningBadgeGallery', () => ({default:()=>null}));
vi.mock('../components/learning/LearningQuizModal', () => ({default:({article,onClose}:any)=>createElement('div',{'data-testid':'quiz'},`Quiz ${article.id}`,createElement('button',{onClick:onClose},'Close Quiz'))}));
let root:Root, container:HTMLDivElement, router:ReturnType<typeof createMemoryRouter>;
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const article=(id:string)=>({id,category_id:'c',title:`Article ${id}`,slug:id,summary:'Summary',content:`Written ${id}`,difficulty_level:'BEGINNER',display_order:1,created_at:'2026-01-01',questions:[],quiz_question_count:1});
  mocks.content.mockResolvedValue([{id:'c',name:'Basics',slug:'basics',description:'',display_order:1,created_at:'',articles:[article('A'),article('B')]}]);
  mocks.badges.mockResolvedValue([]);mocks.state.mockResolvedValue({progressByArticleId:{},earnedBadgeIds:new Set(),learningXp:0,issues:[]});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());router?.dispose();container.remove();});
async function mount(path='/learning') {router=createMemoryRouter([{path:'/learning',element:createElement(LearningPage)}],{initialEntries:[path]});await act(async()=>root.render(createElement(RouterProvider,{router})));}
async function click(text:string){const button=[...container.querySelectorAll('button')].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button!.click());}
function viewer(id:string){return [...container.querySelectorAll('h1')].some(h=>h.textContent===`Article ${id}`);}
it('reopens A after quiz close',async()=>{await mount();await click('Read A');await click('Take Quiz');expect(router.state.location.search).toContain('quiz=1');await click('Close Quiz');expect(router.state.location.search).toBe('');await click('Read A');expect(viewer('A')).toBe(true);});
it('opens B after A quiz close',async()=>{await mount();await click('Read A');await click('Take Quiz');await click('Close Quiz');await click('Read B');expect(viewer('B')).toBe(true);expect(container.querySelector('[data-testid="quiz"]')).toBeNull();});
it('tracks article back/forward',async()=>{await mount();await click('Read A');await click('Read B');await act(async()=>router.navigate(-1));expect(viewer('A')).toBe(true);await act(async()=>router.navigate(1));expect(viewer('B')).toBe(true);});
it('tracks quiz back/forward and navigation to B',async()=>{await mount();await click('Read B');await click('Read A');await click('Take Quiz');await act(async()=>router.navigate(-1));expect(viewer('B')).toBe(true);expect(container.querySelector('[data-testid="quiz"]')).toBeNull();await act(async()=>router.navigate(1));expect(container.querySelector('[data-testid="quiz"]')?.textContent).toContain('Quiz A');await click('Read B');expect(viewer('B')).toBe(true);expect(container.querySelector('[data-testid="quiz"]')).toBeNull();});
it('handles direct links then quiz interactions',async()=>{await mount('/learning?article=A');expect(viewer('A')).toBe(true);await click('Take Quiz');await click('Close Quiz');await click('Read A');expect(viewer('A')).toBe(true);});
it('closes and reopens an article',async()=>{await mount();await click('Read A');await click('Close');expect(router.state.location.search).toBe('');await click('Read A');expect(viewer('A')).toBe(true);});
it.each(['/learning?article=deleted','/learning?article=invalid&quiz=1'])('handles missing %s',async path=>{await mount(path);expect(container.textContent).toContain('This learning article is unavailable');expect(container.querySelector('[data-testid="quiz"]')).toBeNull();await click('Return to Learning Centre');expect(router.state.location.search).toBe('');});

async function mountLayout() {
 router=createMemoryRouter([{element:createElement(AppLayout),children:[
  {path:'/learning',element:createElement(LearningPage)},
  {path:'/financial-tools',element:createElement('h1',{},'Financial Tools')},
 ]}],{initialEntries:['/financial-tools']});
 await act(async()=>root.render(createElement(RouterProvider,{router})));
 const main=container.querySelector('main')!;
 main.scrollTop=900;
 await act(async()=>router.navigate('/learning'));
 expect(main.scrollTop).toBe(900);
 return main;
}
// The foot-of-page link went with the redesign; the roadmap's button is the way across.
it.each(['button'])('opens tools at the top through the Learning %s after a scrolled visit',async kind=>{
 const main=await mountLayout();
 const entry=[...container.querySelectorAll(kind==='link'?'a':'button')].find(el=>el.textContent==='Explore Financial Tools') as HTMLElement;
 expect(entry).toBeTruthy();
 await act(async()=>entry.click());
 expect(router.state.location.pathname).toBe('/financial-tools');
 expect(main.scrollTop).toBe(0);
});
it('does not reset scroll on article deep links, query changes, or unrelated routes',async()=>{
 const main=await mountLayout();
 await act(async()=>router.navigate('/learning?article=A'));
 expect(main.scrollTop).toBe(900);
 await act(async()=>router.navigate('/financial-tools'));
 main.scrollTop=400;
 await act(async()=>router.navigate('/financial-tools?view=goal'));
 expect(main.scrollTop).toBe(400);
 await act(async()=>router.navigate(-1));
 expect(main.scrollTop).toBe(400);
});
