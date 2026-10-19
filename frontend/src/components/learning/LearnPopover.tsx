import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { LEARNING_CALLOUT_SUBTITLES } from '../../data/learningCalloutCopy';
import { relatedArticles, type LearningContext } from '../../data/learningContexts';
import { useLearningArticles } from '../../hooks/useLearningArticles';

/**
 * "Learn as you explore" folded into a page header as a small book button. The
 * full-width callout pushed the content down on pages whose header is already
 * busy; this keeps the same lessons one click away. Renders nothing when there
 * are no lessons for the context, so the header never shows a dead button.
 *
 * On a phone the panel is a sheet pinned to the bottom of the screen, because
 * the button can sit anywhere in a wrapped action row and an anchored panel
 * would run off the left edge.
 */
export default function LearnPopover({ context, onDark = false, className = '' }: {
  context: LearningContext;
  /** On a forest header: the outline button the header's other controls use. */
  onDark?: boolean;
  className?: string;
}) {
  const { articles } = useLearningArticles();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const lessons = relatedArticles(articles, context);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!lessons.length) return null;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Learn as you explore"
        title="Learn as you explore"
        className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
          onDark
            ? 'border-white/25 bg-white/5 text-brand-bg hover:bg-white/15 aria-expanded:bg-white/15 focus-visible:outline-brand-accent'
            : 'border-forest-900/12 bg-white text-forest-700 hover:bg-forest-50 aria-expanded:bg-forest-50 focus-visible:outline-brand-primary'
        }`}
      >
        <BookOpen className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <section
          id={panelId}
          aria-label="Learn as you explore"
          className="fixed inset-x-4 bottom-4 z-40 rounded-[16px] border border-forest-900/10 bg-white p-4 text-left shadow-float sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-forest-900">
            <BookOpen className="h-4 w-4 text-forest-700" aria-hidden="true" />
            Learn as you explore
          </p>
          <p className="mt-1 text-xs leading-relaxed text-brand-muted-fg">{LEARNING_CALLOUT_SUBTITLES[context]}</p>
          <ul className="mt-3 space-y-2">
            {lessons.map(lesson => (
              <li key={lesson.id}>
                <Link
                  to={`/learning?article=${encodeURIComponent(lesson.id)}`}
                  onClick={() => setOpen(false)}
                  className="as-inset group block p-3 transition-colors hover:bg-forest-100 focus-visible:outline-2 focus-visible:outline-brand-primary"
                >
                  <span className="block text-sm font-semibold leading-snug text-forest-900 group-hover:underline">{lesson.title}</span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-brand-muted-fg">{lesson.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/learning"
            onClick={() => setOpen(false)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-forest-700 hover:underline"
          >
            All lessons in the Learning Centre <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}
