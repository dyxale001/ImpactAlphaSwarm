import { useEffect, useState } from 'react';
import { recommendationCatalogue } from '../services/supabase/learningRecommendations';
import type { LearningPreview } from '../data/learningContexts';
import { useAuthStore } from '../store/authStore';

/**
 * The reader's learning catalogue, for the "Learn as you explore" panel and the
 * lessons listed in "About this page". Both read the same recommendations, so they
 * share one loader: two bounded retries on failure and no background polling.
 */
export function useLearningArticles(excludeArticleId?: string) {
  const userId = useAuthStore(s => s.user?.id);
  const [loaded, setLoaded] = useState<{ userId: string; articles: LearningPreview[] } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

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

  const articles = userId && loaded?.userId === userId
    ? loaded.articles.filter(article => String(article.id) !== String(excludeArticleId))
    : [];
  return { articles, refresh: () => setRefreshVersion(value => value + 1) };
}
