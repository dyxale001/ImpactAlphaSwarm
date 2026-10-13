// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LearningQuizModal from './LearningQuizModal';
import type { LearningArticle, LearningQuizResult } from '../../types/learning';
vi.mock('../../services/supabase/learningService',()=>({fetchLearningQuizQuestions:async(id:string)=>[{id:`q${id}`,article_id:id,question:`Question ${id}`,display_order:1,answers:[{id:`a${id}`,question_id:`q${id}`,answer:`Correct ${id}`,is_correct:true,display_order:1}]}]}));
let root:Root,container:HTMLDivElement;
let resolve!:(value:LearningQuizResult)=>void;
let reject!:(error:Error)=>void;
let submit:ReturnType<typeof vi.fn>;
const result:LearningQuizResult={score:100,passed:true,xpEarned:10,newlyEarnedBadges:[],updatedLearningXp:10};
const article=(id:string):LearningArticle=>({id,title:`Article ${id}`,category_id:'c',slug:id,summary:'',content:'',difficulty_level:'BEGINNER',display_order:1,created_at:'',questions:[]});
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);
 submit=vi.fn(()=>new Promise<LearningQuizResult>((yes,no)=>{resolve=yes;reject=no;}));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function show(id:string,key?:string){await act(async()=>root.render(createElement(LearningQuizModal,{key,article:article(id),onClose:vi.fn(),onSubmitQuiz:submit})));}
async function click(label:string){const b=[...container.querySelectorAll('button')].find(b=>b.textContent?.trim()===label)!;expect(b).toBeTruthy();await act(async()=>b.click());}
async function start(id:string){await click(`Correct ${id}`);await click('Submit Quiz');}
it('does not show A result under B, even without a key',async()=>{
 await show('A');await start('A');await show('B');await act(async()=>resolve(result));
 expect(container.textContent).toContain('Article B');expect(container.textContent).toContain('Question B');expect(container.textContent).not.toContain('Congratulations');expect(submit).toHaveBeenCalledTimes(1);
});
it('ignores old results after closing and reopening A as a new attempt',async()=>{
 await show('A','A');await start('A');await act(async()=>root.render(createElement('div')));await show('A','A');await act(async()=>resolve(result));
 expect(container.textContent).toContain('Question A');expect(container.textContent).not.toContain('Congratulations');expect(submit).toHaveBeenCalledTimes(1);
});
it('shows the normal result for its correct article',async()=>{
 await show('A','A');await start('A');await act(async()=>resolve(result));expect(container.textContent).toContain('Article A');expect(container.textContent).toContain('Congratulations');expect(container.textContent).toContain('100%');
});
it('ignores stale rejection during rapid A/B/A navigation',async()=>{
 await show('A');await start('A');await show('B');await show('A');await act(async()=>reject(Error('Old attempt failed')));
 expect(container.textContent).not.toContain('Old attempt failed');expect(container.textContent).not.toContain('Congratulations');expect(container.textContent).toContain('Question A');
});
it('does not start duplicate submissions from rapid activation',async()=>{
 await show('A');await click('Correct A');const b=[...container.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Submit Quiz')!;
 await act(async()=>{b.click();b.click();});expect(submit).toHaveBeenCalledTimes(1);await act(async()=>resolve(result));
});

it('isolates real quiz attempts across URL back and forward navigation',async()=>{
 function QuizRoute(){const [params]=useSearchParams();const id=params.get('article')!;return createElement(LearningQuizModal,{key:id,article:article(id),onClose:vi.fn(),onSubmitQuiz:submit});}
 const router=createMemoryRouter([{path:'/learning',element:createElement(QuizRoute)}],{initialEntries:['/learning?article=B&quiz=1','/learning?article=A&quiz=1'],initialIndex:1});
 await act(async()=>root.render(createElement(RouterProvider,{router})));
 await start('A');await act(async()=>router.navigate(-1));await act(async()=>resolve(result));
 expect(container.textContent).toContain('Article B');expect(container.textContent).not.toContain('Congratulations');
 await act(async()=>router.navigate(1));expect(container.textContent).toContain('Question A');expect(container.textContent).not.toContain('Congratulations');
 router.dispose();
});
