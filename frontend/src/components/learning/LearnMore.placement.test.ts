import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import ts from 'typescript';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
it.each([
 ['../../pages/Watchlist.tsx','hero-card'],['../../pages/WhaleWatching.tsx','hero-card'],['../../pages/MarketNews.tsx','hero-card'],['../../pages/Funds.tsx','hero-card'],['../../pages/Compare.tsx','hero-card'],['../../pages/Dashboard.tsx','<TodayStrip'],['../../pages/FundDetail.tsx','<Hero fund='],['../../pages/AssetDetailsPage.tsx','<ListingLine'],['../../pages/NewsSentimentPage.tsx','<SourcePageHeader'],['../../pages/SocialSentimentPage.tsx','<SourcePageHeader'],['../../pages/HowItWorks.tsx','<h1'],['../../pages/Portfolio.tsx','<h1'],['../../pages/Settings.tsx','<SettingsHero'],['../../pages/Ask.tsx','<h1'],['./FinancialTools.tsx','hero-card'],
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
 expect(read('../../pages/Funds.tsx')).toContain('<LearnMore context="funds" className="mt-6" />');
 const dashboard=read('../../pages/Dashboard.tsx');
 expect(dashboard.match(/<LearnMore /g)).toHaveLength(1);
 expect(read('../dashboard/widgets/learningWidgets.tsx')).toContain('export function LearningNextWidget');
 expect(read('../dashboard/widgets/learningWidgets.tsx')).toContain('export function LearningProgressWidget');
 expect(read('../dashboard/widgets/learningWidgets.tsx')).not.toContain('LearnMore');
});

it('gives Market News a local gap without an empty wrapper', () => {
 expect(read('../../pages/MarketNews.tsx')).toContain('<LearnMore context="news" className="mt-6" />');
});

it('moves the Stocks lessons into About this page', () => {
 const assets = read('../../pages/Assets.tsx');
 expect(assets).not.toContain('<LearnMore ');
 expect(assets).toContain('learnContext="stocks"');
});
