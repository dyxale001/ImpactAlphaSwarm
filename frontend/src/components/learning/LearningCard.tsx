import { Trophy } from "lucide-react";
import type { LearningArticle } from "../../types/learning";

type Props = {
  article: LearningArticle;
  onOpenArticle: (article: LearningArticle) => void;
  onTakeQuiz: (article: LearningArticle) => void;
  canTakeQuiz: boolean;
  hasPerfectScore: boolean;
};

export default function LearningCard({
  article,
  onOpenArticle,
  onTakeQuiz,
  canTakeQuiz,
  hasPerfectScore,
}: Props) {
  return (
    <article
      className="
glass-card
rounded-2xl
p-5
relative
"
    >
      {hasPerfectScore ? (
        <div className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-brand-primary/20 bg-brand-primary/10 text-brand-primary shadow-sm">
          <Trophy className="h-5 w-5" />
        </div>
      ) : null}

      <div className="mb-3 inline-flex rounded-full border border-brand-border bg-brand-bg/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-primary">
        {article.difficulty_level}
      </div>

      <h3
        className="
font-semibold
text-brand-fg
"
      >
        {article.title}
      </h3>

      <p
        className="
text-sm
text-brand-muted-fg
mt-2
"
      >
        {article.summary}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={() => onOpenArticle(article)}
          className="
px-4
py-2
rounded-full
bg-brand-surface
border
border-brand-border
text-sm
transition-colors
hover:border-brand-primary/30
hover:text-brand-primary
"
        >
          Read Article
        </button>

        {canTakeQuiz ? (
          <button
            type="button"
            onClick={() => onTakeQuiz(article)}
            className="
px-4
py-2
rounded-full
bg-brand-primary
text-brand-bg
text-sm
font-medium
transition-opacity
hover:opacity-90
"
          >
            Take Quiz
          </button>
        ) : null}
      </div>
    </article>
  );
}
