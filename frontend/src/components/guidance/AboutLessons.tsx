import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { relatedArticles, type LearningContext } from '../../data/learningContexts';
import { useLearningArticles } from '../../hooks/useLearningArticles';

/**
 * "Learn as you explore", inside "About this page": the lessons tagged for this
 * page, from the same recommendations the standalone panel reads. Renders nothing
 * when there are no matching lessons, so the dialog never shows an empty section.
 */
export default function AboutLessons({ context, title, onNavigate }: {
  context: LearningContext;
  title: string;
  /** Called before leaving for a lesson, so the dialog can close cleanly. */
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { articles } = useLearningArticles();
  const lessons = relatedArticles(articles, context);
  if (!lessons.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h3>
      <ul className="grid gap-2 sm:grid-cols-3">
        {lessons.map(lesson => (
          <li key={lesson.id}>
            <Link
              to={`/learning?article=${encodeURIComponent(lesson.id)}`}
              onClick={onNavigate}
              className="as-inset group flex h-full flex-col gap-2 p-4 transition-colors hover:bg-forest-100 focus-visible:outline-2 focus-visible:outline-brand-primary"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-brand-muted-fg">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Learning Centre
              </span>
              <span className="text-sm font-bold leading-snug text-forest-900 group-hover:underline">{lesson.title}</span>
              <span className="line-clamp-2 text-xs leading-relaxed text-brand-muted-fg">{lesson.summary}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-forest-700">
                Read the lesson <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
