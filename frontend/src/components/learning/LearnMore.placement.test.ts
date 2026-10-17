import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import ts from 'typescript';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
it.each([
 ['../../pages/Dashboard.tsx','<TodayStrip'],['../../pages/Portfolio.tsx','<h1'],['../../pages/Settings.tsx','<SettingsHero'],['../../pages/Ask.tsx','<h1'],['./FinancialTools.tsx','hero-card'],
])('places one callout after the existing header in %s',(path,header)=>{
 const source=read(path);expect(source.indexOf('<LearnMore ')).toBeGreaterThan(source.indexOf(header));
 expect(source.match(/<LearnMore /g)).toHaveLength(1);
 const sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let callout:ts.Node|undefined;function visit(n:ts.Node){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='LearnMore')callout=n;ts.forEachChild(n,visit);}visit(sf);
 expect(callout).toBeDefined();
});
it('removes layout/footer and nested calculator/widget duplicates',()=>{
 for(const path of ['../layout/AppLayout.tsx','../dashboard/widgets/learningWidgets.tsx','./InvestmentPlanner.tsx'])expect(read(path)).not.toContain('<LearnMore ');
 expect(read('../../pages/Settings.tsx')).toContain('tab !== "account"');
 expect(read('../../pages/Ask.tsx')).toContain('!hasHistory && !loading && <LearnMore');
});

it('uses existing Funds spacing and preserves one Dashboard contextual entry point',()=>{
 const funds=read('../../pages/Funds.tsx');
 expect(funds).not.toContain('<LearnMore ');
 expect(funds).toContain('learnContext="funds"');
 const dashboard=read('../../pages/Dashboard.tsx');
 expect(dashboard.match(/<LearnMore /g)).toHaveLength(1);
 expect(read('../dashboard/widgets/learningWidgets.tsx')).toContain('export function LearningNextWidget');
 expect(read('../dashboard/widgets/learningWidgets.tsx')).toContain('export function LearningProgressWidget');
 expect(read('../dashboard/widgets/learningWidgets.tsx')).not.toContain('LearnMore');
});

it('moves the Market News lessons into its About dialog', () => {
 const page = read('../../pages/MarketNews.tsx');
 expect(page).not.toContain('<LearnMore ');
 expect(page).toContain('learnContext="news"');
});

it('moves the Stocks lessons into About this page', () => {
 const assets = read('../../pages/Assets.tsx');
 expect(assets).not.toContain('<LearnMore ');
 expect(assets).toContain('learnContext="stocks"');
});

it('folds the stock page lessons into a header book button', () => {
 const page = read('../../pages/AssetDetailsPage.tsx');
 expect(page).not.toContain('<LearnMore ');
 expect(page).toContain('<LearnPopover context={`stock.${tab}`} />');
 expect(page.indexOf('<LearnPopover ')).toBeLessThan(page.indexOf('</header>'));
});

it('puts the sentiment evidence lessons behind the header book button', () => {
 const page = read('../../pages/SentimentEvidencePage.tsx');
 expect(page).not.toContain('<LearnMore ');
 expect(page.indexOf('<LearnPopover')).toBeLessThan(page.indexOf('</header>'));
});

it('puts the How it works lessons behind the header book button', () => {
 const page = read('../../pages/HowItWorks.tsx');
 expect(page).not.toContain('<LearnMore ');
 expect(page.indexOf('<LearnPopover')).toBeLessThan(page.indexOf('</header>'));
});

it('puts the fund page lessons behind the header book button', () => {
 const page = read('../../pages/FundDetail.tsx');
 expect(page).not.toContain('<LearnMore ');
 expect(page).toContain('lessons={<LearnPopover context={`fund.${active}`} />}');
});

it('moves the Compare lessons into its About dialog', () => {
 const page = read('../../pages/Compare.tsx');
 expect(page).not.toContain('<LearnMore ');
 expect(page).toContain('learnContext={`compare.${kind}`}');
});

it('moves the Whale Watching lessons into its About dialog', () => {
 const page = read('../../pages/WhaleWatching.tsx');
 expect(page).not.toContain('<LearnMore ');
 expect(page).toContain('learnContext="whales"');
});

it('puts the Watchlist lessons behind a book button in its header', () => {
 const page = read('../../pages/Watchlist.tsx');
 expect(page).not.toContain('<LearnMore ');
 expect(page).toContain('<LearnPopover context="watchlist" onDark />');
 expect(page.indexOf('<LearnPopover')).toBeLessThan(page.indexOf('Toolbar'));
});
