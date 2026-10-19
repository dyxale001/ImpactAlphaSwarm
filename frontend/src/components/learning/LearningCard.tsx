import { Check, Trophy } from "lucide-react";
import type { LearningArticle, LearningQuizStatus } from "../../types/learning";

type Props = {
  article: LearningArticle;
  onOpenArticle: (article: LearningArticle) => void;
  onTakeQuiz: (article: LearningArticle) => void;
  canTakeQuiz: boolean;
  hasPerfectScore: boolean;
  quizStatus?: LearningQuizStatus;
};

/** "BEGINNER" as "Beginner", as the level reads everywhere else. */
export function levelLabel(level: string) {
  return level ? level.charAt(0).toUpperCase() + level.slice(1).toLowerCase() : level;
}

// One lesson in the Library, as the conservative design draws it: the level, the
// title and summary, and the two ways in. A completed lesson says so beside the
// level, and a perfect quiz score carries the trophy it always has.
export default function LearningCard({
  article,
  onOpenArticle,
  onTakeQuiz,
  canTakeQuiz,
  hasPerfectScore,
  quizStatus,
}: Props) {
  const completed = quizStatus === "COMPLETED";
  return (
    <article className="as-card flex h-full flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip">{levelLabel(article.difficulty_level)}</span>
        {hasPerfectScore ? (
          <span className="chip chip-accent" title="You scored 100% on this quiz">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
            100%
          </span>
        ) : completed ? (
          <span className="chip chip-up">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Done
          </span>
        ) : null}
      </div>

      <h3 className="text-base font-bold leading-snug text-forest-900">{article.title}</h3>
      <p className="line-clamp-3 text-sm leading-relaxed text-brand-muted-fg">{article.summary}</p>

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={() => onOpenArticle(article)} className="as-btn as-btn-sm as-btn-secondary">
          Read article
        </button>
        {canTakeQuiz ? (
          <button type="button" onClick={() => onTakeQuiz(article)} className="as-btn as-btn-sm as-btn-primary">
            {completed ? "Retake quiz" : "Take quiz"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
