import { supabase } from '../../lib/supabase';
import type { LearningPreview } from '../../data/learningContexts';
let cache: { userId: string; at: number; promise: Promise<LearningPreview[]>; pending: boolean } | null = null;
/** Share in-flight requests across all panels; force refresh never duplicates an active request. */
export function recommendationCatalogue(userId: string, force = false) {
  if (cache?.userId === userId && (cache.pending || (!force && Date.now() - cache.at < 60_000))) return cache.promise;
  const entry = { userId, at: Date.now(), pending: true, promise: Promise.resolve([] as LearningPreview[]) };
  entry.promise = Promise.resolve(supabase.from('learning_articles').select('id,title,summary,tags,display_order'))
    .then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []) as LearningPreview[];
    }).finally(() => { entry.pending = false; entry.at = Date.now(); });
  cache = entry;
  return entry.promise;
}
