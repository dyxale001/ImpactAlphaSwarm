import { Link } from "react-router-dom";
import { Award, BookOpen, Sparkles } from "lucide-react";
import { useLearningSummary } from "../../../hooks/useLearningSummary";
import { WidgetEmpty, WidgetLoading } from "./widgetChrome";

// Learning widgets. The learning centre already tracks XP, quiz scores and
// badges; these surface that progress next to the market data instead of behind
// its own tab, which is where a reader is most likely to act on it.

/** XP, badges and how far through the articles the reader is. */
export function LearningProgressWidget() {
  const {
    learningXp,
    articlesCompleted,
    articlesTotal,
    badgesEarned,
    badgesTotal,
    earnedBadges,
    isLoading,
    error,
  } = useLearningSummary();

  if (isLoading) return <WidgetLoading rows={2} />;
  if (error) return <WidgetEmpty message={error} />;

  const pct =
    articlesTotal > 0
      ? Math.round((articlesCompleted / articlesTotal) * 100)
      : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold text-brand-fg">
          {learningXp.toLocaleString("en-GB")}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
          Learning XP
        </span>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-brand-muted-fg">
          <span>
            {articlesCompleted} of {articlesTotal} articles
          </span>
          <span className="font-mono">{pct}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-brand-border/40"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Articles completed"
        >
          <div
            className="h-full rounded-full bg-brand-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="chip bg-brand-primary/10 text-brand-primary">
          <Award className="h-2.5 w-2.5" />
          {badgesEarned} of {badgesTotal} badges
        </span>
      </div>

      {earnedBadges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {earnedBadges.slice(0, 6).map((badge) => (
            <span
              key={badge.id}
              title={`${badge.name}: ${badge.description}`}
              className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-brand-primary/20 bg-brand-primary/10"
            >
              {badge.icon_url ? (
                <img
                  src={badge.icon_url}
                  alt={badge.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Sparkles className="h-3 w-3 text-brand-primary" />
              )}
            </span>
          ))}
        </div>
      ) : null}

      <Link
        to="/learning"
        className="inline-block text-xs font-semibold text-brand-primary hover:underline"
      >
        Learning centre →
      </Link>
    </div>
  );
}

/** The next thing to read, so learning is one click rather than a decision. */
export function LearningNextWidget() {
  const { nextArticle, nextArticleCategory, isLoading, error } =
    useLearningSummary();

  if (isLoading) return <WidgetLoading rows={2} />;
  if (error) return <WidgetEmpty message={error} />;
  if (!nextArticle) {
    return (
      <WidgetEmpty
        message="You have finished every article in the learning centre."
        action={
          <Link
            to="/learning"
            className="text-xs font-semibold text-brand-primary hover:underline"
          >
            Review your badges
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 text-brand-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
          Up next
        </p>
      </div>

      <div>
        <span className="chip bg-brand-border/30 text-brand-muted-fg">
          {nextArticle.difficulty_level}
        </span>
        <h3 className="mt-2 text-sm font-semibold leading-snug text-brand-fg">
          {nextArticle.title}
        </h3>
        {nextArticleCategory ? (
          <p className="mt-0.5 text-[11px] text-brand-muted-fg">
            {nextArticleCategory}
          </p>
        ) : null}
        {nextArticle.summary ? (
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-brand-muted-fg">
            {nextArticle.summary}
          </p>
        ) : null}
      </div>

      {/* The learning page opens an article in a modal keyed off its own state,
          so there is no deep link to one. Sending the reader to the centre is
          the honest version of this until there is. */}
      <Link
        to="/learning"
        className="inline-block text-xs font-semibold text-brand-primary hover:underline"
      >
        Open the learning centre →
      </Link>
    </div>
  );
}
