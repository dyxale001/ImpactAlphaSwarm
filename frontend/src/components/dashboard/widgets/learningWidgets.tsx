import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Trophy } from "lucide-react";
import { useDashboardLearning } from "../../../dashboard/DashboardDataContext";
import { levelLabel } from "../../learning/LearningCard";
import { WidgetEmpty, WidgetHeaderLink, WidgetLoading } from "./widgetChrome";

// Learning widgets. The learning centre already tracks XP, quiz scores and
// badges; these surface that progress next to the market data instead of behind
// its own tab, which is where a reader is most likely to act on it. Both are the
// Learning page's two light top cards, in widget form.

/** XP, badges and how far through the lessons the reader is. */
export function LearningProgressWidget() {
  const { progress } = useDashboardLearning();
  if (progress.isLoading) return <WidgetLoading rows={2} />;
  if (progress.error || !progress.summary) return <WidgetEmpty message={progress.error ?? "Unable to load your learning progress."} />;
  const { learningXp, articlesCompleted, articlesTotal, badgesEarned, badgesTotal, earnedBadges } = progress.summary;

  const pct =
    articlesTotal > 0
      ? Math.round((articlesCompleted / articlesTotal) * 100)
      : 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <WidgetHeaderLink to="/learning">Open</WidgetHeaderLink>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums tracking-[-0.01em] text-forest-900">
            {learningXp.toLocaleString("en-GB")}
          </p>
          <p className="text-xs text-brand-muted-fg">Learning XP</p>
        </div>
        <span className="chip chip-accent">
          <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
          {badgesEarned} of {badgesTotal} badges
        </span>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-forest-900">Lessons completed</span>
          <span className="tabular-nums text-brand-muted-fg">
            {articlesCompleted} of {articlesTotal} · {pct}%
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-forest-50"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Lessons completed"
        >
          <div className="h-full rounded-full bg-forest-700 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {earnedBadges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {earnedBadges.slice(0, 6).map((badge) => (
            <span
              key={badge.id}
              title={`${badge.name}: ${badge.description}`}
              className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-forest-50 text-forest-700"
            >
              {badge.icon_url ? (
                <img src={badge.icon_url} alt={badge.name} className="h-full w-full object-cover" />
              ) : (
                <Trophy className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The next thing to read, so learning is one click rather than a decision. */
export function LearningNextWidget() {
  const { nextArticle, nextArticleCategory, articlesTotal, isLoading, error } =
    useDashboardLearning().next;

  if (isLoading) return <WidgetLoading rows={2} />;
  if (error) return <WidgetEmpty message={error} />;
  if (articlesTotal === 0) return <WidgetEmpty message="No learning content available yet." />;
  if (!nextArticle) {
    return (
      <WidgetEmpty
        message="You have finished every lesson in the learning centre."
        action={
          <Link to="/learning" className="as-btn as-btn-sm as-btn-secondary">
            Review your badges
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800" aria-hidden="true">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="chip">{levelLabel(nextArticle.difficulty_level)}</span>
        {nextArticleCategory ? <span className="text-xs text-brand-muted-fg">{nextArticleCategory}</span> : null}
      </div>

      <div className="min-w-0">
        <h3 className="break-words text-base font-bold leading-snug tracking-[-0.01em] text-forest-900">
          {nextArticle.title}
        </h3>
        {nextArticle.summary ? (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-brand-muted-fg">{nextArticle.summary}</p>
        ) : null}
      </div>

      {/* Open the same article and preserve its quiz/progress identity. */}
      <div className="mt-auto">
        <Link
          to={`/learning?article=${encodeURIComponent(nextArticle.id)}`}
          className="as-btn as-btn-sm as-btn-primary"
        >
          Read lesson
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
