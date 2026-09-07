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
      {/* XP and the article bar go on the forest hero: they are the widget's
          headline, and the accent bar against the dark surface shows progress
          at a glance in a way a grey rule on white never did. */}
      <div className="hero-card overflow-hidden p-4">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold text-brand-bg">
            {learningXp.toLocaleString("en-GB")}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-accent">
            Learning XP
          </span>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-brand-bg/70">
            <span>
              {articlesCompleted} of {articlesTotal} articles
            </span>
            <span className="font-mono text-brand-accent">{pct}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Articles completed"
          >
            <div
              className="h-full rounded-full bg-brand-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-3 py-2.5">
        <span className="chip">
          <Award className="h-2.5 w-2.5" />
          {badgesEarned} of {badgesTotal} badges
        </span>

        {earnedBadges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {earnedBadges.slice(0, 6).map((badge) => (
              <span
                key={badge.id}
                title={`${badge.name}: ${badge.description}`}
                className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-brand-primary/25 bg-brand-primary/10"
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
      </div>

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
      {/* The article sits on the forest hero the top pick uses. This widget is
          a single recommendation rather than a list, so it can carry the dark
          surface without competing with anything beside it — and it stops the
          one piece of the dashboard asking to be read looking like a footnote
          in grey on white. */}
      <div className="hero-card overflow-hidden p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-brand-accent" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-accent">
            Up next
          </p>
        </div>

        {/* Accent fill behind dark text: the chip's forest default would sink
            into the forest surface behind it. */}
        <span className="chip mt-2.5 bg-brand-accent text-brand-fg">
          {nextArticle.difficulty_level}
        </span>

        <h3 className="mt-2 text-sm font-semibold leading-snug text-brand-bg">
          {nextArticle.title}
        </h3>
        {nextArticleCategory ? (
          <p className="mt-0.5 text-[11px] text-brand-bg/60">
            {nextArticleCategory}
          </p>
        ) : null}
        {nextArticle.summary ? (
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-brand-bg/75">
            {nextArticle.summary}
          </p>
        ) : null}
      </div>

      {/* The learning page opens an article in a modal keyed off its own state,
          so there is no deep link to one. Sending the reader to the centre is
          the honest version of this until there is. */}
      <Link
        to="/learning"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-accent px-4 py-2 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
      >
        Open the learning centre →
      </Link>
    </div>
  );
}
