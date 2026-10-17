import { useEffect, useState, useId } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { LEARNING_CALLOUT_SUBTITLES } from '../../data/learningCalloutCopy';
import { Link } from 'react-router-dom';
import { recommendationCatalogue } from '../../services/supabase/learningRecommendations';
import { relatedArticles, type LearningContext, type LearningPreview } from '../../data/learningContexts';
import { useAuthStore } from '../../store/authStore';
export default function LearnMore({ context, excludeArticleId, topics, className = "" }: { context: LearningContext; excludeArticleId?: string; className?: string; topics?: Array<{ context: LearningContext; label: string }> }) {
  const userId = useAuthStore(s => s.user?.id);
  const [loaded, setLoaded] = useState<{ userId: string; articles: LearningPreview[] } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [expanded, setExpanded] = useState(() => {
    try { return sessionStorage.getItem('alphaswarm:learning-callout-expanded') === 'true'; } catch { return false; }
  });
  const [selectedTopic, setSelectedTopic] = useState<LearningContext>(context);
  const panelId = useId();
  function toggle() {
    setExpanded(value => {
      try { sessionStorage.setItem('alphaswarm:learning-callout-expanded', String(!value)); } catch { /* unavailable */ }
      return !value;
    });
  }
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function load() {
      if (!userId || cancelled) return;
      try {
        const articles = await recommendationCatalogue(userId, refreshVersion > 0 || attempts > 0);
        if (!cancelled) setLoaded({ userId, articles });
      } catch {
        // Two bounded retries, shared across panels. No perpetual background polling.
        if (!cancelled && attempts < 2) timer = setTimeout(() => { attempts++; void load(); }, attempts === 0 ? 5000 : 15000);
      }
    }
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userId, refreshVersion]);
  const availableArticles = userId && loaded?.userId === userId ? loaded.articles.filter(article => String(article.id) !== String(excludeArticleId)) : [];
  const availableTopics = topics?.filter(topic => relatedArticles(availableArticles, topic.context).length > 0);
  const activeContext = topics ? availableTopics?.find(topic => topic.context === selectedTopic)?.context ?? availableTopics?.[0]?.context ?? context : context;
  const matches = relatedArticles(availableArticles, activeContext);
  if (!matches.length) return null;
  return <section aria-label="Learn as you explore" className={`overflow-hidden rounded-[20px] border border-forest-900/8 bg-white shadow-card ${className}`}>
    <button type="button" onClick={toggle} aria-expanded={expanded} aria-controls={panelId} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-primary hover:bg-brand-bg/60">
      <BookOpen className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-forest-700">Learn as you explore</span><span className="mt-0.5 block text-xs leading-relaxed text-brand-muted-fg">{LEARNING_CALLOUT_SUBTITLES[activeContext]}</span></span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-brand-muted-fg transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    <div id={panelId} hidden={!expanded} className="space-y-3 border-t border-forest-900/8 px-4 pb-4 pt-3">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {availableTopics && availableTopics.length > 1 && <label className="mr-auto flex items-center gap-2 text-xs text-brand-muted-fg">Topic<select value={activeContext} onChange={event => setSelectedTopic(event.target.value as LearningContext)} className="min-h-11 rounded-lg border border-brand-border bg-brand-bg px-2 text-brand-fg">{availableTopics.map(topic => <option key={topic.context} value={topic.context}>{topic.label}</option>)}</select></label>}
        <button type="button" onClick={() => setRefreshVersion(value => value + 1)} className="text-xs text-brand-muted-fg underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-primary">Refresh</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">{matches.map(article => <Link key={article.id} to={`/learning?article=${encodeURIComponent(article.id)}`} className="as-inset min-w-0 p-3 transition-colors hover:bg-forest-100 focus-visible:outline-2 focus-visible:outline-brand-primary">
        <p className="text-sm font-semibold text-brand-fg">{article.title}</p><p className="mt-1 text-xs leading-relaxed text-brand-muted-fg line-clamp-2">{article.summary}</p>
      </Link>)}</div>
    </div>
  </section>;
}
